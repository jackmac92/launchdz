const fs = require('fs')
const shell = require('shelljs')
const write = require('write')
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

const getCommonInfo = async () => {
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
  const genWithScript = await getResult({
    type: 'toggle',
    message: 'Do you want to write a script for this service to execute?',
    initial: true,
    enabled: 'Create script (better for complex scripts)',
    disabled: 'No scriptfile needed'
  })

  const cmd = await (async () => {
    if (!genWithScript) {
      return getResult({
        type: 'input',
        message: 'What command should be executed?'
      })
    }
    const scriptPath = `${process.env.HOME}/.launchdz/scripts/${label}.sh`
    console.log('Opening a text file for you to write the script...')
    await write(scriptPath, '#! /bin/bash\n')
    await new Promise(r => {
      setTimeout(r, 2000)
    })
    await shell.exec(`$EDITOR ${scriptPath}`)
    await getResult({
      type: 'confirm',
      initial: true,
      message: "Just making sure you're done editing the script!"
    })

    return `/bin/bash ${scriptPath}`
  })()

  return { cmd, label }
}

const handleEnvVars = async () => {
  let stillAdding = true
  const _envVars = {}
  const addEnvVar = strEnvVar => {
    const [k, ...rest] = strEnvVar.split('=')
    const v = rest.join('=')
    _envVars[k] = v
  }

  while (stillAdding) {
    const message =
      'What environment variable would you like to add, specify one at a time as VARIABLE=VALUE'
    addEnvVar(await getResult({ type: 'input', message }))
    stillAdding = await getResult({
      type: 'confirm',
      message: 'Add another Environment Variable?'
    })
  }
}

const handleSTDIO = async label => {
  const choices = await getResult({
    type: 'multiselect',
    message: 'Specify files for stdio?',
    choices: ['In', 'Out', 'Error']
  })
  choices.reduce(
    async (acc, el) => ({
      ...acc,
      [`Standard${el}Path`]: await getResult({
        type: 'input',
        message: `Which file should be used for std ${el.toLowerCase()}`
      })
    }),
    {
      StandardOutPath: `${process.env.HOME}/.launchdz/logs/${label}/out.log`,
      StandardErrorPath: `${process.env.HOME}/.launchdz/logs/${label}/error.log`
    }
  )
}
const handleKeepAlive = async () => {
  const pList = {}
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
  return pList
}

async function generatePlist() {
  const pList = {}
  const { cmd, label } = await getCommonInfo()
  const trgChoices = {
    boot: 'On Boot',
    interval: 'Interval Timer'
    // cal: 'Calendar'
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
    })
    // , [trgChoices.cal]: getResult({})
  }[triggerMethod]

  Object.assign(pList, triggerConfig)

  if (
    await getResult({
      type: 'confirm',
      initial: true,
      message: 'Keep the process alive?'
    })
  ) {
    Object.assign(pList, await handleKeepAlive())
  }
  pList.Label = `${LABEL_BASE}.${label}`
  pList.ProgramArguments = cmd.split(' ')
  return pList
}
const PRG_T_PROC = 'proc'
const PRG_T_INTERVAL = 'interval'
const PROGRAM_TYPES = [PRG_T_PROC, PRG_T_INTERVAL]

async function generateFromTemplate(argz) {
  const pList = {}
  const { cmd, label } = await getCommonInfo()
  pList.Label = `${LABEL_BASE}.${label}`
  pList.ProgramArguments = cmd.split(' ')
  const { progtype: serviceType } = argz
  switch (serviceType) {
    case 'proc': {
      pList.RunAtLoad = true
      pList.LaunchOnlyOnce = true
      // Use default KeepAlive until successful exit?
      if (
        await getResult({
          type: 'confirm',
          initial: true,
          message: 'KeepAlive until successful exit? Or something else'
        })
      ) {
        pList.KeepAlive = {}
        pList.KeepAlive.SuccessfulExit = false
      } else {
        Object.assign(pList, await handleKeepAlive())
      }
      break
    }
    case 'interval': {
      pList.RunAtLoad = true
      pList.StartInterval = await getResult({
        type: 'input',
        message: 'How many seconds between automatic invocations?',
        validate: n => {
          if (Number.isNaN(parseInt(n, 10))) {
            return 'Invalid number, requires integer'
          }
          if (n < 1) {
            return 'Number must be greater than 1'
          }
          return true
        }
      })

      break
    }
    default: {
      throw Error(
        `This should never happen, but ${serviceType} is not a handled serviceType`
      )
    }
  }
  Object.assign(pList, await handleSTDIO(pList.Label))
  pList.EnvironmentVariables = await handleEnvVars()

  return pList
}

async function addPlist(argz) {
  let plist
  if (argz.progtype) {
    plist = await generateFromTemplate(argz)
  } else if (argz.manual) {
    plist = await generatePlist()
  } else {
    console.warn(`
      How do you want to create the launchd service?
      You either need to pass the --walkthru flag for a full guided setup
      Or choose one of the templates for a quick setup!
      Templates are: ${PROGRAM_TYPES.join('|')}
    `)
    process.exit(1)
  }

  const plistStr = plistBuilder(plist)
  if (argz.print) {
    console.log(plistStr)
  } else if (argz.daemon) {
    throw Error('Not supported')
  } else {
    const plistFilePath = `${process.env.HOME}/Library/LaunchAgents/${plist.Label}`
    await write(plistFilePath, plistStr)
    if (!argz.noLoad) {
      await shell.exec(`launchctl load ${plistFilePath}`)
    }
    console.log('Successfully loaded the new launchd service')
  }
  return Promise.resolve()
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
      'mk [progtype]',
      'create a new plist file for launchd',
      yargs => {
        yargs.option('daemon', {
          type: 'boolean',
          description: 'Create a LaunchDaemon instead of a LaunchAgent'
        })
        yargs.option('noLoad', {
          type: 'boolean',
          description: 'Prevent automatically loading the new launchd service'
        })
        yargs.option('guided', {
          type: 'boolean',
          description: 'Longer process that walks you through creation'
        })
        yargs.option('progtype', {
          type: 'positional',
          description: 'Use a template for generating the service'
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
