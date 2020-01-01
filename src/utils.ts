const { prompt } = require('enquirer')

export const getResult = (...prmpts) =>
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
