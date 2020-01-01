import { getResult } from '../utils'

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

export default handleEnvVars
