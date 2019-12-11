const fs = require('fs')
const { prompt } = require('enquirer')
const { build: plistBuilder } = require('plist')

const LABEL_BASE = 'local.npm-launchd-wizard'

// templates
// persistent daemon
//   keepalive always?
//   stdio
// run at login
//   keepalive always?
//   stdio
// self destructing?

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
    message: 'What is the text label for this service?',
    validate: s => {
      if (s.indexOf(' ') !== -1) {
        return 'Name not allowed to include spaces'
      }
      return true
    }
  })
  const cmd = await getResult({
    type: 'input',
    message: 'What command should be executed?'
  })
  const trgChoices = {
    boot: 'On Boot',
    interval: 'Interval Timer',
    cal: 'Calendar',
    fswatch: 'Watch Path for Changes'
  }
  const triggerMethod = await getResult({
    type: 'select',
    message: 'How should the command be triggered?',
    choices: Object.values(trgChoices)
  })
  const triggerConfig = await {
    [trgChoices.boot]: Promise.resolve({
      RunAtLoad: true
    }),
    [trgChoices.interval]: getResult({
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
    }),
    [trgChoices.fswatch]: getResult({}),
    [trgChoices.cal]: getResult({})
  }[triggerMethod]
  // const addEnvironmentVariables = async () => {
  //   // split on first space to get key
  //   pList.EnvironmentVariables = await
  // }

  Object.assign(pList, triggerConfig)
  if (triggerMethod === trgChoices.fswatch) {
    pList.ThrottleInterval = await getResult({
      type: 'numeric',
      message: 'Throttle invocations?'
    })
  }
  if (
    await getResult({
      type: 'confirm',
      initial: true,
      message: 'Keep the process alive?'
    })
  ) {
    const alwaysAlive = await getResult({
      type: 'toggle',
      message:
        'Keep Alive ALWAYS? ' +
        'Note: This can create issues for things like updates which want to close the app',
      initial: true,
      enabled: 'Yes',
      disabled: 'No, selectively'
    })
    if (alwaysAlive) {
      pList.KeepAlive = true
    } else {
      pList.KeepAlive = {}
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
  }
  // pList.LaunchOnlyOnce = argz.onlyOnce
  // pList.RunAtLoad = argz.runAtLoad

  pList.Label = `${LABEL_BASE}.${label}`
  pList.ProgramArguments = cmd.split(' ')
  return pList
}

async function addPlist(argz) {
  const plist = await generatePlist()
  const plistStr = plistBuilder(plist)
  if (!argz.daemon) {
    throw Error('Not supported')
  }
  if (argz.print) {
    console.log(plistStr)
  } else {
    fs.writeFileSync(`~/Library/LaunchAgents/${plist.label}`, plistStr)
  }
}
function listLaunchd(argz) {
  return new Promise((resolve, reject) => {
    fs.readdir(`${process.env.HOME}/Library/LaunchAgents`, (err, items) => {
      if (err) {
        return reject(err)
      }
      const filterFn = argz.all ? () => true : i => i.startsWith(LABEL_BASE)
      resolve(items.filter(filterFn))
    })
  })
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
        yargs.option('print', {
          type: 'boolean',
          short: 'p',
          description: 'Write the resulting file to stdout'
        })
      },
      addPlist
    )
    .command(
      'list',
      'list plist files created by this app',
      yargs => {
        yargs.option('all', {
          short: 'a',
          type: 'boolean',
          description:
            'Include all launchd services, not just those from this utility'
        })
      },
      listLaunchd
    )
    .demand(1, 'Please specify one of the commands!')
    .help().argv

module.exports.run = main
