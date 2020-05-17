import child_process from "child_process";
import write from "write";
import { getResult } from "../utils";

const getCommonInfo = async (typeToGenerate, argz) => {
  const label = await getResult({
    type: "input",
    message: "What is the text label for this service?",
    validate: s => {
      if (s.indexOf(" ") !== -1) {
        return "Name not allowed to include spaces";
      }
      return true;
    }
  });

  const scriptPath = (suffix?: string) =>
    `${process.env.HOME}/.launchdz/scripts/${[label, suffix]
      .filter(a => a)
      .join("-")}.sh`;
  const mainScriptPath = scriptPath();
  console.log("Opening a text file for you to write the script...");
  await write(mainScriptPath, "#! /usr/bin/env bash\n");
  await new Promise(r => {
    setTimeout(r, 2000);
  });
  const writeScript = async (scriptLocation: string) => {
    let userIsEditing = true;
    while (userIsEditing) {
      child_process.execFileSync(process.env.EDITOR, [scriptLocation], {
        stdio: "inherit"
      });

      userIsEditing = !(await getResult({
        type: "confirm",
        initial: true,
        message: "Just making sure you're done editing the script!"
      }));
    }
  };

  if (typeToGenerate === "fswatch-proc") {
    const helperScript = scriptPath("helper");
    await writeScript(helperScript);
    const { targetRenames, filePrefix, folders } = argz;
    await write(
      mainScriptPath,
      `\
      /usr/local/bin/fswatch --event ${
        targetRenames ? "Renamed" : "Created"
      } -0 ${folders.join(" ")} | while read -d "" event; do
      if echo "$event" | grep -q "${filePrefix}" ${
        targetRenames ? '&& [ -f "$event" ]' : ""
      }; then
          /bin/bash ${helperScript} "$event"
      fi
      done`
    );
  } else {
    await writeScript(mainScriptPath);
  }
  const cmd = `/bin/bash ${mainScriptPath}`;

  return { cmd, label };
};

export default getCommonInfo;
