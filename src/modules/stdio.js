const { getResult } = require('../utils')

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

module.exports = handleSTDIO
