const Broker = require('./index')
const {
  secureRandom,
  createConnection,
  newLogger,
  createTopic,
  retryProtocol,
} = require('testHelpers')

describe('Broker > OffsetCommit', () => {
  let topicName, groupId, seedBroker, broker, groupCoordinator

  beforeEach(async () => {
    topicName = `test-topic-${secureRandom()}`
    groupId = `consumer-group-id-${secureRandom()}`

    seedBroker = new Broker({
      connection: createConnection(),
      logger: newLogger(),
    })
    await seedBroker.connect()

    createTopic({ topic: topicName })

    const metadata = await seedBroker.metadata([topicName])
    // Find leader of partition
    const partitionBroker = metadata.topicMetadata[0].partitionMetadata[0].leader
    const newBrokerData = metadata.brokers.find(b => b.nodeId === partitionBroker)

    // Connect to the correct broker to produce message
    broker = new Broker({
      connection: createConnection(newBrokerData),
      logger: newLogger(),
    })
    await broker.connect()

    const { coordinator: { host, port } } = await retryProtocol(
      'GROUP_COORDINATOR_NOT_AVAILABLE',
      async () => await seedBroker.findGroupCoordinator({ groupId })
    )

    groupCoordinator = new Broker({
      connection: createConnection({ host, port }),
      logger: newLogger(),
    })
    await groupCoordinator.connect()
  })

  afterEach(async () => {
    await seedBroker.disconnect()
    await broker.disconnect()
    await groupCoordinator.disconnect()
  })

  test('request', async () => {
    const produceData = [
      {
        topic: topicName,
        partitions: [
          {
            partition: 0,
            messages: [{ key: `key-0`, value: `some-value-0` }],
          },
        ],
      },
    ]

    await broker.produce({ topicData: produceData })
    const { generationId, memberId } = await groupCoordinator.joinGroup({
      groupId,
      sessionTimeout: 30000,
      groupProtocols: [{ name: 'AssignerName', metadata: '{"version": 1}' }],
    })

    const groupAssignment = [
      {
        memberId,
        memberAssignment: { [topicName]: [0] },
      },
    ]

    await groupCoordinator.syncGroup({
      groupId,
      generationId,
      memberId,
      groupAssignment,
    })

    const topics = [
      {
        topic: topicName,
        partitions: [{ partition: 0, offset: '0' }],
      },
    ]

    const response = await groupCoordinator.offsetCommit({
      groupId,
      groupGenerationId: generationId,
      memberId,
      topics,
    })

    expect(response).toEqual({
      responses: [{ partitions: [{ errorCode: 0, partition: 0 }], topic: topicName }],
    })
  })
})
