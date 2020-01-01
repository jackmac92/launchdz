import { run } from '../index'

jest.mock('yargs')

describe('main cli function', () => {
  it('returns a promise', () => {
    const result = run()
    expect(typeof result.then).toEqual('function')
  })
})
