import { getResult } from "../utils";

interface StdioOpts {
  StandardOutPath: string;
  StandardInPath: string;
  StandardErrorPath?: string;
}

const handleSTDIO = (label: string): Promise<StdioOpts> =>
  getResult({
    type: "multiselect",
    message: "Specify files for stdio?",
    choices: ["In", "Out", "Error"]
  }).then(choices =>
    choices.reduce(
      (prom, el) =>
        prom.then(async acc => ({
          ...acc,
          [`Standard${el}Path`]: await getResult({
            type: "input",
            message: `Which file should be used for std ${el.toLowerCase()}`
          })
        })),
      Promise.resolve({
        StandardOutPath: `${process.env.HOME}/.launchdz/logs/${label}/out.log`,
        StandardErrorPath: `${process.env.HOME}/.launchdz/logs/${label}/error.log`,
        StandardInPath: `${process.env.HOME}/.launchdz/input/${label}`
      })
    )
  );

export default handleSTDIO;
