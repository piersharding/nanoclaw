---
name: mini-research
description: >
  Conduct mini coding research projects that investigate how to do something
  in a programming language or framework.  Each project explores a specific topic,
  technology, or investigation in an isolated and modular way. The investigation
  produces a markdown report with code snippets, a working minimal implementation,
  and a runnable proof-of-concept test.
  Triggers on: "mini research project", "research into", "investigate how to",
  "evaluate methods for", "looking to do research", "research the trade offs".
---

# Mini Research Project

Produce a self-contained research project in `/workspace/extra/autoresearch/`.

## Workflow

1. **Define scope** — Identify the topic, language/framework, and key questions. If the prompt is broad (e.g. "evaluate top 3 methods for X"), narrow to specific candidates before coding.

2. **Research** — Use web search and documentation to understand the landscape. Gather facts, not opinions. Note version numbers and dates.

3. **Create project folder**
   ```
   /workspace/extra/autoresearch/<slug>/
   ├── README.md          # The research report - Final report summarizing the process, findings, and outcomes
   ├── notes.md           # Records discoveries, methods attempted, issues encountered, and lessons learned during the investigation
   ├── src/               # Minimal working implementation
   └── tests/             # At least one runnable proof-of-concept test
   ```
   Use a short kebab-case slug derived from the topic (e.g. `go-tui-apps`, `rust-vs-go-ssh-tunneling`), where the topic is short and descriptive.
   Do NOT place projects in subdirectories or nested structures.

4. **Implement** — Write the minimum code that demonstrates the concept. Keep it small and readable. Include comments that explain *why*, not *what*. If comparing alternatives, implement each in a separate subdirectory under `src/`.

5. **Test** — Write at least one test that can be executed with a single command. Include a `## Running` section in README.md with the exact command. Verify the test passes before proceeding.

6. **Write README.md** — Structure:
   ```markdown
   # <Topic>

   ## Question
   One-sentence statement of what this research investigates.

   ## TL;DR
   2-3 sentence summary of findings.

   ## Findings
   Detailed analysis with code snippets highlighting essential components.
   Use fenced code blocks with language tags.

   ## Trade-offs
   Table or bullet list of pros/cons when comparing alternatives.

   ## Running
   Exact commands to build and run the proof-of-concept test.

   ## References
   Links to documentation, articles, and repos consulted.
   ```

<<<<<<< HEAD
7. **Branch, commit, and push** — Create a feature branch, commit, and push:
=======
7. **Branch, commit, and push feature branch** — Create a feature branch, commit, and push:
>>>>>>> 3f273a3 (skill: add mini-research for coding research projects)
   ```bash
   cd /workspace/extra/autoresearch
   export GIT_SSH_COMMAND="ssh -i /workspace/extra/allowedSSHKeys/id_rsa -o StrictHostKeyChecking=no"
   git checkout -b feature/<slug>
   git add <slug>/
   git commit -m "research: <short description>"
   git push -u origin feature/<slug>
   ```
   After pushing, report the GitHub branch URL to the user:
   `https://github.com/piersharding/autoresearch/tree/feature/<slug>`

<<<<<<< HEAD
=======
8. **Ask for confirmation to merge** — Send a message to the user summarizing what was done (topic, key findings, files created, test results) and ask:
   > Research complete on feature/<slug>. Review the branch here:
   > https://github.com/piersharding/autoresearch/tree/feature/<slug>
   >
   > Reply *merge* to merge into main and push, or *skip* to leave it on the feature branch.

   Then **wait for the user's reply**. Do not proceed until they respond.

9. **Merge to main and push** — Only if the user confirms with "merge" (or similar affirmative):
   ```bash
   cd /workspace/extra/autoresearch
   export GIT_SSH_COMMAND="ssh -i /workspace/extra/allowedSSHKeys/id_rsa -o StrictHostKeyChecking=no"
   git checkout main
   git merge feature/<slug>
   git push origin main
   ```
   Report that the merge is complete. If the user said "skip" or declined, do nothing further.

>>>>>>> 3f273a3 (skill: add mini-research for coding research projects)
## Guidelines

- Target the latest stable version of any language/framework unless the user specifies otherwise.
- If a topic requires system packages not available in the container, document the dependencies in README.md and write the code anyway — the user can run it on the host.
- For comparison projects, use the same problem/benchmark across all candidates so results are directly comparable.
- Keep total code under 300 lines per candidate. This is a research spike, not a production project.
- Projects may also include:
  - Custom code or scripts developed during the research
  - If external code was modified: then only provide a git diff file (NOT the full original repository)
  - Binary outputs created during the project (must be <2MB)
- The final commit should contain only the approved files listed above

### What to Commit

✅ **DO commit:**
- Your `notes.md` and `README.md` files
- Custom code or scripts you developed
- Git diff output from modified external code
- Binary outputs <2MB that were created during the project

❌ **DO NOT commit:**
- Full copies of code fetched or cloned for experiments
- Large binary files (>2MB)
- Complete external repositories
- `_summary.md` files (these are generated automatically)

### Recording work

- Use `notes.md` to document your investigation process as you work
- Upon completion, create a comprehensive `README.md` report
- The final commit should contain only the approved files listed above
- The `.gitignore` file excludes Python cache files and build artifacts
- Verify that build artifacts are not being committed
- Use meaningful commit messages that describe the research progress

## Code Style and Conventions

### General Principles

- Keep projects isolated and self-contained within their folders
- Document thoroughly in `notes.md` as you work
- Focus on research outcomes, not production-quality code
- Experiments are encouraged; failures are valuable learning experiences

### Language-Specific Notes

This is a multi-language repository. Projects may use:
- Go (see `bubbletea-elktail-integration`)
- Python (see `sandbox` with various Python demos)
- Shell scripts and configuration files
- Other languages as appropriate for the research topic

Follow the best practices for each language within each project.

## Build and Test Instructions

Each project may have different build/test requirements:

### Go Projects

- Standard Go tools: `go build`, `go test`, `go mod tidy` may be used for projects that include Go code
- Note: Research projects may contain Go code samples or analysis without being complete Go modules
- A complete Go module requires a `go.mod` file; `go.sum` files are generated for dependency tracking
- Some research projects may contain partial Go code for analysis or reference purposes only

### Python Projects

- Virtual environments recommended for isolation
- Dependencies may vary per project
- Check for `requirements.txt` or similar dependency files

### Docker/Container Projects

- Projects in `sandbox` may involve Docker, Podman, Kubernetes, or gvisor
- Check `SECURITY.md` in the sandbox directory for security considerations
- Follow container best practices for isolation and sandboxing

## Security Considerations

- When working with containerization, sandboxing, or security-related research topics, review the `sandbox/SECURITY.md` file
- Be mindful of container escape risks when working with sandboxing technologies
- Document any security findings in project notes and README

## References

- See `AGENTS.md` for detailed guidelines on organizing mini research projects
