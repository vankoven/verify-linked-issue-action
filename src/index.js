
const core = require('@actions/core')
const github = require('@actions/github');
const context = github.context;
const token = process.env.GITHUB_TOKEN;
const octokit = github.getOctokit(token);
const fs = require('fs')

async function verifyLinkedIssue() {
  let linkedIssue = await checkBodyForValidIssue(context, github);
  if (linkedIssue) {
    core.notice("Success! Linked Issue Found!");
  }
  else {
    await createMissingIssueComment(context, github);
    core.error("No Linked Issue Found!");
    core.setFailed("No Linked Issue Found!");
  }
}

async function checkBodyForValidIssue(context, github) {
  let body = context.payload.pull_request.body;
  if (!body) {
    return false;
  }
  let not_req = core.getInput('keyword_link_not_required');
  if (not_req) {
    const not_req_rex = new RegExp(not_req.replace(/\\/g, "\\"));
    if (not_req_rex.test(body)) {
      core.debug("Skipping linkage check: explicitly marked as not required to have a linkage");
      return true;
    }
  }

  const owner = core.getInput("owner");
  let delim = '';
  if (owner) {
    delim = "/";
  }
  const repo = core.getInput("repo");
  const keyword = core.getInput("keyword").replace(/\\/g, "\\");
  const re = new RegExp(`${keyword}\\s+${owner}${delim}${repo}#(\\d+)`, "g");
  core.debug(`Checking re "${re}" against PR Body: "${body}"`);

  const matches = body.match(re);
  core.debug(`regex matches: ${matches}`);
  if (matches) {
    // TODO: regex may contain more than just an issue number, and issue may
    // belong to another repo. Let the user choose skip issue check or not.
    if (core.getInput('validate_links') == 'false') {
      return true;
    }
    for (let i = 0, len = matches.length; i < len; i++) {
      let match = matches[i];
      let issueId = match.replace('#', '').trim();
      core.debug(`verifying match is a valid issue issueId: ${issueId}`);
      try {
        let issue = await octokit.rest.issues.get({
          owner: owner,
          repo: repo,
          issue_number: issueId,
        });
        if (issue) {
          core.debug(`Found issue in PR Body ${issueId}`);
        }
      }
      catch {
        core.debug(`#${issueId} is not a valid issue.`);
      }
    }
    return true;
  }
  return false;
}

async function createMissingIssueComment(context, github) {
  const defaultMessage = 'Build Error! No Linked Issue found. Please link an issue or mention it in the body using #<issue_id>';
  let messageBody = core.getInput('message');
  if (!messageBody) {
    let filename = core.getInput('filename');
    if (!filename) {
      filename = '.github/VERIFY_PR_COMMENT_TEMPLATE.md';
    }
    messageBody = defaultMessage;
    try {
      const file = fs.readFileSync(filename, 'utf8')
      if (file) {
        messageBody = file;
      }
      else {
        messageBody = defaultMessage;
      }
    }
    catch {
      messageBody = defaultMessage;
    }
  }

  core.debug(`Adding comment to PR. Comment text: ${messageBody}`);
  await octokit.rest.issues.createComment({
    issue_number: context.payload.pull_request.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: messageBody
  });
}

async function run() {

  try {
    if (!context.payload.pull_request) {
      core.info('Not a pull request skipping verification!');
      return;
    }

    core.debug('Starting Linked Issue Verification!');
    await verifyLinkedIssue();

  } catch (err) {
    core.error(`Error verifying linked issue.`)
    core.error(err)

    if (err.errors) core.error(err.errors)
    const errorMessage = "Error verifying linked issue."
    core.setFailed(errorMessage + '\n\n' + err.message)
  }

}

run();
