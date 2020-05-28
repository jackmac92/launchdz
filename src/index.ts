import * as Sentry from "@sentry/node";
import fs from "fs";
import { build as plistBuilder } from "plist";
import shell from "shelljs";
import write from "write";
import getCommonInfo from "./modules/core";
import handleEnvVars from "./modules/envVars";
import handleKeepAlive from "./modules/keepAlive";
import prebakedOfferings from "./prebaked/index";
import { getResult } from "./utils";

Sentry.init({
  release: `${process.env.npm_package_name}-${process.env.npm_package_version}`,
  dsn:
    "https://3600e5fcc078461db1372bff6b909ccf@o260107.ingest.sentry.io/5191242"
});

const LABEL_BASE = "local.npm-launchd-wizard";

// templates
// persistent daemon
//   keepalive always?
//   stdio
// run at login
//   keepalive always?
//   stdio
// self destructing?
async function generateFromTemplate(serviceType, argz) {
  const pList: { [key: string]: any } = {};
  const { cmd, label } = await getCommonInfo(serviceType, argz);
  pList.Label = `${LABEL_BASE}.${label}`;
  pList.ProgramArguments = cmd.split(" ");
  switch (serviceType) {
    case "fswatch-proc": {
      pList.RunAtLoad = true;
      pList.LaunchOnlyOnce = true;
      pList.KeepAlive = {};
      pList.KeepAlive.SuccessfulExit = false;
      break;
    }
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

  // @ts-ignore
  return require("yargs")
    .completion()
    .command(
      "proc",
      "create a new plist file for launchd",
      yargs => {
        defaultArgSetup(yargs);
      },
      a => addPlist("proc", a)
    )
    .command(
      "fswatch-proc",
      "Run a code snippet when something in a folder changes",
      yargs => {
        defaultArgSetup(yargs);
        yargs.option("folders", {
          type: "array",
          short: "f"
        });
        yargs.option("filePrefix", {
          type: "string",
          default: ".",
          description:
            "Only invoke command if file event starts with this prefix"
        });
        yargs.option("targetRenames", {
          type: "boolean",
          default: false
        });

        yargs.demandOption("folders");
      },
      a => addPlist("fswatch-proc", a)
    )
    .command(
      "prebaked [prebakedOption]",
      "Install a preconfigured launchd service",
      yargs => {
        yargs.positional("prebakedOption", {
          describe: "Which prebaked service would you like?"
        });
        yargs.option("autoInstallDeps", {
          type: "boolean",
          alias: "f",
          default: false,
          describe: "Automatically install missing requirements?"
        });
      },
      async a => {
        const choiceOfPrebaked = a.prebakedOption as string;
        if (!prebakedOfferings[choiceOfPrebaked]) {
          throw Error(
            `Please choose a supported pre-baked app\n${Object.keys(
              prebakedOfferings
            )}`
          );
        }
        const prebakedApp = prebakedOfferings[choiceOfPrebaked](a);
        const scriptPath = `${process.env.HOME}/.launchdz/scripts/${prebakedApp.NAME}.sh`;
        const missingDependencies = await prebakedApp.requiredTools.reduce(
          (missingDeps: string[], [dep, autoInstallCmd]: [string, string?]) => {
            let isMissing = false;

            if (shell.exec(`command -v ${dep} > /dev/null 2>&1`).code !== 0) {
              const shouldTryInstall = a.autoInstallDeps && autoInstallCmd;
              if (shouldTryInstall) {
                if (shell.exec(autoInstallCmd).code !== 0) {
                  isMissing = true;
                }
              } else {
                isMissing = true;
              }
            }
            if (isMissing) {
              missingDeps.push(dep);
            }
            return missingDeps;
          },
          []
        );

        if (missingDependencies.length !== 0) {
          console.error(
            "It appears you are missing dependencies!:\n",
            missingDependencies.join("\n\t")
          );
          process.exit(1);
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
