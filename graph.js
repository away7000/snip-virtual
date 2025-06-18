const { gql, request } = require('graphql-request')
const query = gql`{
  factoryGeneses(
    orderBy: endTime
    orderDirection: asc
    skip: 2
    where: {status: "live"}
  ) {
    id
    contractAddress
    name
    ticker
    createdAt
    startTime
    endTime
    status
    finalOutcome
    participations{
      virtuals
    }
  }
}`
const url = 'https://subgraph.satsuma-prod.com/2300544c4ff5/apes-weird--426656/virtual-genesis/version/v0.0.2/api'

async function fetchSubgraphData() {
  const data = await request(url, query, {})
  return data
}

module.exports = {
  fetchSubgraphData
}