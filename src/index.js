const fs = require('fs')
const { prompt } = require('enquirer')
const { build: plistBuilder } = require('plist')

async function generatePlist() {
  const pList = {}
  const getResult = (...prmpts) =>
    prompt(prmpts.map((prmpt, idx) => ({ name: `result${idx}`, ...prmpt })))
      .then(answers =>
        Object.keys(answers)
          .filter(k => k.startsWith('result'))
          .map(rk => answers[rk])
      )
      .then(z => {
        if (z.length > 1) {
          return z
        }
        return z[0]
      })

  const label = await getResult({
    type: 'input',
    message: 'What is the text label for this service?'
  })
  const cmd = await getResult({
    type: 'input',
    message: 'What command should be executed?'
  })
  const triggerMethod = await getResult({
    type: 'select',
    message: 'How should the command be triggered?',
    choices: ['Interval Timer', 'Calendar', 'Watch Path']
  })
  const triggerConfig = await getResult(
    {
      // TODO handle cron like input
      'Interval Timer': {
        type: 'input',
        message: 'How many seconds between automatic invocations?',
        validate: n => {
          if (Number.isNaN(parseInt(n, 0))) {
            return 'Invalid number, requires integer'
          }
          if (n < 1) {
            return 'Number must be greater than 1'
          }
          return true
        },
        result: choice => ({
          StartInterval: choice
        })
      },
      Calendar: {
        type: ''
      }
      // 'Watch Path': {}
    }[triggerMethod]
  )
  Object.assign(pList, triggerConfig)

  // sudo cp ~/Downloads/com.zerowidth.launched.mqtt-benthos-helper.plist /Library/LaunchDaemons
  // sudo launchctl load -w /Library/LaunchDaemons/com.zerowidth.launched.mqtt-benthos-helper.plist

  // const throttleSecs = await getResult({
  //   type: 'numeric',
  //   message: 'Throttle invocations?'
  // })
  if (
    await getResult({
      type: 'confirm',
      initial: true,
      message: 'Keep the process alive?'
    })
  ) {
    const alwaysAlive = await getResult({
      type: 'toggle',
      message: 'Keep Alive always?',
      initial: true,
      enabled: 'Yes',
      disabled: 'No, selectively'
    })
    if (alwaysAlive) {
      pList.KeepAlive = true
    } else {
      const keepAliveOpts = await getResult({
        type: 'multiselect',
        message: 'Which factors should determine KeepAlive status?',
        choices: [
          'Crashed',
          'NetworkState',
          'SuccessfulExit'
          // { name: 'Depending on the existence of a path', value: 'PathState' },
        ]
      })
      for (let ii = 0; ii < keepAliveOpts.length; ii++) {
        const element = keepAliveOpts[ii]
        pList.KeepAlive[element] = await getResult(
          {
            Crashed: {
              type: 'toggle',
              message: 'How should it respond to Crashed',
              disabled: 'restart unless it crashes',
              enabled: 'restart job after it crashes'
            },
            NetworkState: {
              type: 'toggle',
              message: 'How should it respond to NetworkState',
              enabled: 'restart when the system has network issues',
              disabled:
                'do not restart the job solely because the system has network issues'
            },
            SuccessfulExit: {
              type: 'toggle',
              message: 'How should it respond to SuccessfulExit',
              disabled: 'restart until job succeeds',
              enabled: 'restart until job fails'
            }
          }[element]
        )
      }
    }
    // ...depending on the Existence of a Path: PathState
    // Use this subkey to keep a job alive as long as a given path exists (true) or does not exist (false).
    // KeepAlive = { PathState: '/tmp/runJob': true }
  }

  // MISC
  // AbandonProcessGroup
  // When launchd wants to terminate a job it sends a SIGTERM signal which will be propagated to all child processes of the job as well. Setting the value of this key to true will stop this propagation, allowing the child processes to survive their parents.

  pList.Label = `local.npm-launchd-wizard.${label}`
  pList.ProgramArguments = cmd.split(' ')
  // pList.LaunchOnlyOnce = argz.onlyOnce
  // pList.RunAtLoad = argz.runAtLoad
  return pList
}

async function addPlist(argz) {
  const plist = await generatePlist()
  const plistStr = plistBuilder(plist)
  if (!argz.daemon) {
    throw Error('fuck you think you doing')
  }
  fs.writeFileSync(`~/Library/LaunchAgents/${plist.label}`, plistStr)
}

const main = async () =>
  require('yargs')
    .command(
      'mk',
      'create a new plist file for launchd',
      yargs => {
        yargs.option('daemon', {
          type: 'boolean',
          description: 'Create a LaunchDaemon instead of a LaunchAgent'
        })
      },
      addPlist
    )
    .command(
      'list',
      'list plist files created by this app',
      yargs => {
        yargs
      },
      () => {
        fs.readdir(
          `${process.env.HOME}/Library/LaunchAgents`,
          (_err, items) => {
            items.forEach(item => {
              console.log(item)
            })
          }
        )
      }
    )
    .demand(1, 'Please specify one of the commands!')
    .help().argv

module.exports.run = main
