const { requests, lookup } = require('../../protocol/requests')
const apiKeys = require('../../protocol/requests/apiKeys')
const PlainAuthenticator = require('./plain')
const { KafkaJSSASLAuthenticationError } = require('../../errors')

const AUTHENTICATORS = { PLAIN: PlainAuthenticator }
const SUPPORTED_MECHANISMS = Object.keys(AUTHENTICATORS)

module.exports = class SASLAuthenticator {
  constructor(connection, logger, versions) {
    this.connection = connection
    this.logger = logger
    this.saslHandshake = lookup(versions)(apiKeys.SaslHandshake, requests.SaslHandshake)
  }

  async authenticate() {
    const mechanism = this.connection.sasl.mechanism.toUpperCase()
    if (!SUPPORTED_MECHANISMS.includes(mechanism)) {
      throw new KafkaJSSASLAuthenticationError(
        `SASL ${mechanism} mechanism is not supported by the client`
      )
    }

    const handshake = await this.connection.send(this.saslHandshake({ mechanism }))
    if (!handshake.enabledMechanisms.includes(mechanism)) {
      throw new KafkaJSSASLAuthenticationError(
        `SASL ${mechanism} mechanism is not supported by the server`
      )
    }

    const Authenticator = AUTHENTICATORS[mechanism]
    await new Authenticator(this.connection, this.logger).authenticate()
  }
}
