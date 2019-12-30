const fs = require('fs')
const shell = require('shelljs')
const write = require('write')
const handleSTDIO = require('./modules/stdio')
const handleKeepAlive = require('./modules/keepAlive')
const handleEnvVars = require('./modules/envVars')
const getCommonInfo = require('./modules/core')
const { build: plistBuilder } = require('plist')
const { getResult } = require('./utils')

const LABEL_BASE = 'local.npm-launchd-wizard'

// templates
// persistent daemon
//   keepalive always?
//   stdio
// run at login
//   keepalive always?
//   stdio
// self destructing?

async function generateFromTemplate(serviceType, _argz) {
  const pList = {}
  const { cmd, label } = await getCommonInfo()
  pList.Label = `${LABEL_BASE}.${label}`
  pList.ProgramArguments = cmd.split(' ')
  switch (serviceType) {
    case 'proc': {
      pList.RunAtLoad = true
      pList.LaunchOnlyOnce = true
      // Use default KeepAlive until successful exit?

      if (
        await getResult({
          type: 'toggle',
          message: 'How should launchd supervise this process?',
          initial: true,
          enabled: 'Keep Alive until successful exit',
          disabled: 'Specify custom Keep Alive rules'
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

async function addPlist(serviceType, argz) {
  const plist = await generateFromTemplate(serviceType, argz)

  const plistStr = plistBuilder(plist)
  if (argz.print) {
    console.log(plistStr)
  } else {
    if (argz.daemon) {
      const plistFilePath = `/System/Library/LaunchDaemons/${plist.Label}.plist`
      await shell.exec(`
      sudo cat <<EOF > ${plistFilePath}
      ${plistStr}

      EOF

      `)
      if (!argz.noLoad) {
        await shell.exec(`sudo launchctl load ${plistFilePath}`)
      }
    } else {
      const plistFilePath = `${process.env.HOME}/Library/LaunchAgents/${plist.Label}.plist`
      await write(plistFilePath, plistStr)
      if (!argz.noLoad) {
        await shell.exec(`launchctl load ${plistFilePath}`)
      }
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
const main = async () => {
  const globalArgs = [
    [
      'daemon',
      {
        type: 'boolean',
        description: 'Create a LaunchDaemon instead of a LaunchAgent'
      }
    ],
    [
      'noLoad',
      {
        type: 'boolean',
        description: 'Prevent automatically loading the new launchd service'
      }
    ],
    [
      'print',
      {
        type: 'boolean',
        short: 'p',
        description: 'Write the resulting file to stdout'
      }
    ]
  ]
  const defaultArgSetup = yrgs => {
    globalArgs.forEach(([name, opts]) => {
      yrgs.option(name, opts)
    })
  }
  return require('yargs')
    .command(
      'proc',
      'create a new plist file for launchd',
      yargs => {
        defaultArgSetup(yargs)
      },
      a => addPlist('proc', a)
    )
    .command(
      'interval',
      'create a new interval process for launchd',
      yargs => {
        defaultArgSetup(yargs)
      },
      a => addPlist('interval', a)
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
      a => listLaunchd(a).then(a => a.forEach(b => console.log(b)))
    )
    .demand(1, 'Please specify one of the commands!')
    .help().argv
}

module.exports.run = main
