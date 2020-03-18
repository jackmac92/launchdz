import fs from "fs";
import shell from "shelljs";
import write from "write";
import handleKeepAlive from "./modules/keepAlive";
import handleEnvVars from "./modules/envVars";
import getCommonInfo from "./modules/core";
import prebakedOfferings from "./prebaked/index";
import { build as plistBuilder } from "plist";
import { getResult } from "./utils";

const LABEL_BASE = "local.npm-launchd-wizard";

// templates
// persistent daemon
//   keepalive always?
//   stdio
// run at login
//   keepalive always?
//   stdio
// self destructing?
async function generateFromTemplate(serviceType, _argz) {
  const pList: { [key: string]: any } = {};
  const { cmd, label } = await getCommonInfo();
  pList.Label = `${LABEL_BASE}.${label}`;
  pList.ProgramArguments = cmd.split(" ");
  switch (serviceType) {
    case "proc": {
      pList.RunAtLoad = true;
      pList.LaunchOnlyOnce = true;
      // Use default KeepAlive until successful exit?

      if (
        await getResult({
          type: "toggle",
          message: "How should launchd supervise this process?",
          initial: true,
          enabled: "Keep Alive until successful exit",
          disabled: "Specify custom Keep Alive rules"
        })
      ) {
        pList.KeepAlive = {};
        pList.KeepAlive.SuccessfulExit = false;
      } else {
        Object.assign(pList, await handleKeepAlive());
      }
      break;
    }
    case "interval": {
      pList.RunAtLoad = true;
      pList.StartInterval = await getResult({
        type: "input",
        message: "How many seconds between automatic invocations?",
        validate: n => {
          if (Number.isNaN(parseInt(n, 10))) {
            return "Invalid number, requires integer";
          }
          if (n < 1) {
            return "Number must be greater than 1";
          }
          return true;
        }
      });

      break;
    }
    default: {
      throw Error(
        `This should never happen, but ${serviceType} is not a handled serviceType`
      );
    }
  }

  const envVars = await handleEnvVars();
  if (envVars.length > 0) {
    pList.EnvironmentVariables = envVars.reduce(
      (acc, [k, v]) => ({ ...acc, [k]: v }),
      {}
    );
  }

  return pList;
}

const loadPlist = async (plistStr, plistFilePath, noLoad) => {
  if (plistFilePath.startsWith("/System")) {
    await shell.exec(`
      sudo cat <<EOF > ${plistFilePath}
      ${plistStr}

      EOF

      `);
    if (!noLoad) {
      await shell.exec(`sudo launchctl load ${plistFilePath}`);
    }
  } else {
    await write(plistFilePath, plistStr);
    if (!noLoad) {
      await shell.exec(`launchctl load ${plistFilePath}`);
    }
  }
  console.log("Successfully loaded the new launchd service");
};

async function addPlist(serviceType, argz) {
  const plist = await generateFromTemplate(serviceType, argz);

  const plistStr = plistBuilder(plist);
  if (argz.print) {
    console.log(plistStr);
  } else {
    const plistFilePath = argz.daemon
      ? `/System/Library/LaunchDaemons/${plist.Label}.plist`
      : `${process.env.HOME}/Library/LaunchAgents/${plist.Label}.plist`;

    await loadPlist(plistStr, plistFilePath, argz.noLoad);
  }
  return Promise.resolve();
}

function listLaunchdItems(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const plistFilePath = `${process.env.HOME}/Library/LaunchAgents`;
    fs.readdir(plistFilePath, (err, items) => {
      if (err) {
        return reject(err);
      }
      resolve(items);
    });
  });
}
function listLaunchd(argz): Promise<string[]> {
  return listLaunchdItems().then(items => {
    const filterFn = argz.all ? () => true : i => i.startsWith(LABEL_BASE);
    const result = items.filter(filterFn);
    return result;
  });
}
const main = async () => {
  const globalArgs = [
    [
      "daemon",
      {
        type: "boolean",
        description: "Create a LaunchDaemon instead of a LaunchAgent"
      }
    ],
    [
      "noLoad",
      {
        type: "boolean",
        description: "Prevent automatically loading the new launchd service"
      }
    ],
    [
      "print",
      {
        type: "boolean",
        short: "p",
        description: "Write the resulting file to stdout"
      }
    ]
  ];
  const defaultArgSetup = yrgs => {
    globalArgs.forEach(([name, opts]) => {
      yrgs.option(name, opts);
    });
  };
  return require("yargs")
    .command(
      "proc",
      "create a new plist file for launchd",
      yargs => {
        defaultArgSetup(yargs);
      },
      a => addPlist("proc", a)
    )
    .command(
      "prebaked [prebakedOption]",
      "Install a preconfigured launchd service",
      yargs => {
        yargs.positional("prebakedOption", {
          describe: "Which prebaked service would you like?"
        });
      },
      async a => {
        if (!prebakedOfferings[a.prebakedOption]) {
          throw Error(
            `Please choose a supported pre-baked app\n${Object.keys(
              prebakedOfferings
            )}`
          );
        }
        const prebakedApp = prebakedOfferings[a.prebakedOption](a);
        const scriptPath = `${process.env.HOME}/.launchdz/scripts/${prebakedApp.NAME}.sh`;
        const missingDeps = await prebakedApp.requiredTools.reduce(
          async (missingDeps: string[], dep: string) => {
            if (shell.exec(`command -v ${dep} > /dev/null 2>&1`).code !== 0) {
              missingDeps.push(dep);
            }
            return missingDeps;
          },
          []
        );

        if (missingDeps.length !== 0) {
          console.warn("It appears you are missing dependencies!", missingDeps);
        }
        await write(scriptPath, prebakedApp.script);
        await loadPlist(
          prebakedApp.plist,
          `${process.env.HOME}/Library/LaunchAgents/${prebakedApp.LABEL}.plist`,
          a.noLoad
        );
      }
    )
    .command(
      "interval",
      "create a new interval process for launchd",
      yargs => {
        defaultArgSetup(yargs);
      },
      a => addPlist("interval", a)
    )
    .command(
      "list",
      "list plist files created by this app",
      yargs => {
        yargs.option("all", {
          short: "a",
          type: "boolean",
          description:
            "Include all launchd services, not just those from this utility"
        });
      },
      a =>
        listLaunchd(a).then(a => {
          console.log(`Found ${a.length} entries`);
          a.forEach(i => console.log(i));
        })
    )
    .demand(1, "Please specify one of the commands!")
    .help().argv;
};

export const run = main;
