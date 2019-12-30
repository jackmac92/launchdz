const { getResult } = require('../utils')

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

module.exports = handleKeepAlive
