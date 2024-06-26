export default async function unverifiedCommits ({
  github,
  githubToken,
  context
}) {
  const commits = await github.rest.pulls.listCommits({
    pull_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo
  })
  const previousCommentsQuery = `query ($owner: String!, $name: String!, $prnumber: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $prnumber) {
            comments(last: 50) {
              nodes {
                id
                author {
                  login
                }
                body
              }
            }
          }
        }
      }`
  const deleteMutation = `mutation($comment:ID!) {
        deleteIssueComment(input: {id:$comment}) {
          clientMutationId
        }
      }`
  const previousComments = await github.graphql(previousCommentsQuery, {
    owner: context.repo.owner,
    name: context.repo.repo,
    prnumber: context.issue.number
  })
  const commentPrefix = 'The following commits were not [verified](https://github.com/brave/handbook/blob/master/development/commit-and-tag-signing.md):\n'
  const actionPreviousComments = previousComments.repository.pullRequest.comments.nodes.filter(
    c => c.author.login === 'github-actions' && c.body.startsWith(commentPrefix)
  )
  const unverifiedCommits = commits.data.filter(c => c.commit.verification.verified !== true)
  if (unverifiedCommits.length) {
    const commitList = unverifiedCommits.map(c => `${c.sha} (${c.commit.verification.reason})`).join('\n')
    const body = commentPrefix + commitList
    let commentExists = false
    for (const comment of actionPreviousComments) {
      if (comment.body === body) {
        console.log('Good comment found:', comment)
        commentExists = true
      } else {
        console.log('Deleting', comment)
        await github.graphql(deleteMutation, { comment: comment.id })
      }
    }
    if (!commentExists) {
      console.log('Creating new comment')
      github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body
      })
      return 'UNVERIFIED-CHANGED' // A new comment was created
    }
    return 'UNVERIFIED'
  } else {
    console.log('Commits verified')
    for (const comment of actionPreviousComments) {
      console.log('Deleting', comment)
      await github.graphql(deleteMutation, { comment: comment.id })
    }
  }
}
