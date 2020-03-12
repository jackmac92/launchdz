export const requiredTools = ["fswatch"];
const NAME = "auto-copy-screenshots";
const LABEL = `local.npm-launchd-wizard.${NAME}`;
const script = `
#! /bin/bash

# listeninig for Rename event because
# the Screenshot is initially saved
# as a hidden file, and then renamed to be visible
/usr/local/bin/fswatch --event Renamed -0 ${process.env.HOME}/Desktop | while read -d "" event; do
  if echo "$event" | grep -q "\/Screen Shot"; then
    osascript \
        -e 'set this_file to POSIX file "'"$event"'" as alias' \
        -e 'tell application "Image Events"' \
            -e 'launch' \
            -e 'set this_image to open this_file' \
            -e 'copy the image file of this_image to imgfile' \
            -e 'set the clipboard to (read imgfile as PNG)' \
            -e 'close this_image' \
        -e 'end tell'

    osascript -e 'display notification "Copied screenshot to clipboard!"'
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
