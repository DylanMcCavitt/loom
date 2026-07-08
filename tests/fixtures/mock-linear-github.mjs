function closesIssue(body, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#?${escaped}\\b`, "iu").test(body);
}

export function createWorld() {
  const linear = {
    projects: new Map(),
    issues: new Map(),
    seq: 0,
  };
  const github = {
    branches: new Map(),
    prs: new Map(),
    seq: 0,
  };

  const api = {
    createProject(name) {
      const id = `proj-${(linear.seq += 1)}`;
      linear.projects.set(id, { id, name, docs: [] });
      return id;
    },
    addDoc(projectId, title) {
      const p = linear.projects.get(projectId);
      if (!p) throw new Error(`unknown project ${projectId}`);
      p.docs.push(title);
    },

    createIssue({ key, project, parentId = null, blockedBy = [], labels = [] }) {
      if (linear.issues.has(key)) throw new Error(`duplicate issue ${key}`);
      for (const b of blockedBy) {
        if (!linear.issues.has(b)) {
          throw new Error(`blocker ${b} must be created before ${key}`);
        }
      }
      linear.issues.set(key, {
        key,
        project,
        parentId,
        blockedBy: [...blockedBy],
        labels: [...labels],
        state: "todo",
      });
      return key;
    },
    issue(key) {
      const i = linear.issues.get(key);
      if (!i) throw new Error(`unknown issue ${key}`);
      return i;
    },
    setState(key, state) {
      api.issue(key).state = state;
    },

    openPr(issueKey, branch, body = "") {
      api.issue(issueKey);
      if (!branch.includes(issueKey)) {
        throw new Error(`branch '${branch}' must carry issue id '${issueKey}'`);
      }
      github.branches.set(branch, issueKey);
      const number = (github.seq += 1);
      github.prs.set(number, {
        number,
        branch,
        issueId: issueKey,
        merged: false,
        closes: closesIssue(body, issueKey),
      });
      api.setState(issueKey, "in_review");
      return number;
    },

    merge(prNumber, gates) {
      const pr = github.prs.get(prNumber);
      if (!pr) throw new Error(`unknown PR ${prNumber}`);
      const required = ["tests", "review", "acceptance", "ci", "minimalDiff"];
      const red = required.filter((g) => gates[g] !== true);
      if (red.length) {
        const err = new Error(`refused: red gate(s) ${red.join(",")}`);
        err.red = red;
        throw err;
      }
      const issue = api.issue(pr.issueId);
      const openBlockers = issue.blockedBy.filter(
        (b) => api.issue(b).state !== "done",
      );
      if (openBlockers.length) {
        throw new Error(`refused: open blockers ${openBlockers.join(",")}`);
      }
      pr.merged = true;
      if (pr.closes) api.setState(pr.issueId, "done");
      return pr;
    },
  };

  return { linear, github, api };
}
