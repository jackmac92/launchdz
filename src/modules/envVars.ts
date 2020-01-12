import { getResult } from '../utils'

const handleEnvVars = async () => {
  const _envVars = []
  const addEnvVar = strEnvVar => {
    const [k, ...rest] = strEnvVar.split('=')
    const v = rest.join('=')
    _envVars.push([k, v])
  }
  let stillAdding = await getResult({
    type: 'confirm',
    message: 'Do you need to specify Environment Variables for this service?'
  })

  while (stillAdding) {
    const message =
      'What environment variable would you like to add, specify one at a time as VARIABLE=VALUE'
    addEnvVar(await getResult({ type: 'input', message }))
    stillAdding = await getResult({
      type: 'confirm',
      message: 'Add another Environment Variable?'
    })
  }
  return _envVars
}

export default handleEnvVars
