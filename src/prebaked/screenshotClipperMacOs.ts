export const requiredTools = ["fswatch"];
const NAME = "auto-copy-screenshots";
const LABEL = `local.npm-launchd-wizard.${NAME}`;
const script = `
#! /bin/bash

/usr/local/bin/fswatch --event Renamed -0 ${process.env.HOME}/Desktop | while read -d "" event; do
  echo "Detected rename event in Desktop folder"
  # checkinig for '/' below to prevent matching the hidden file created in the interim
  if echo "$event" | grep -q "\/Screen Shot"; then
    echo "Copying screenshot to clipboard"
    ${process.env.HOME}/my/code/randomScripts/HAMMERSPOON/copyImageToClipboard.sh "$event"
  fi
done
`;
const plist = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
      <array>
        <string>/bin/bash</string>
        <string>${process.env.HOME}/.launchdz/scripts/${NAME}.sh</string>
      </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
    </dict>
  </dict>
</plist>
`;

export default () => ({ plist, script, NAME, LABEL });
