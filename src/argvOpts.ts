// TODO this file should be readable by a test, in order to generate inputs for fast-check tests

export default [
  [
    "command",
    [
      "proc",
      "create a new plist file for launchd",
      yargs => {
        defaultArgSetup(yargs);
      },
      a => addPlist("proc", a)
    ]
  ],
  [
    "command",
    [
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
        const scriptPath = `${process.env.HOME}/.launchdz/scripts/${prebakedApp.LABEL}.sh`;
        await write(scriptPath, prebakedApp.script);
        await loadPlist(
          prebakedApp.plist,
          `${process.env.HOME}/Library/LaunchAgents/${prebakedApp.LABEL}.plist`,
          a.noLoad
        );
      }
    ]
  ],
  [
    "command",
    [
      "interval",
      "create a new interval process for launchd",
      yargs => {
        defaultArgSetup(yargs);
      },
      a => addPlist("interval", a)
    ]
  ],
  [
    "command",
    [
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
    ]
  ]
];
// .demand(1, "Please specify one of the commands!")
