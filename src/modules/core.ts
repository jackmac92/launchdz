import { getResult } from '../utils'
import shell from 'shelljs'
import write from 'write'

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

  const cmd = `/bin/bash ${scriptPath}`

  return { cmd, label }
}

export default getCommonInfo
