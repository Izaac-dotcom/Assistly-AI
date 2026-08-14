from pathlib import Path

p = Path("server.js")
s = p.read_text()

old = """  const taskPrompt =
    `You are working as an AI employee for a project.\\n\\n` +
    `Project: ${project.name}\\n` +
    `Task: ${nextTask.title}\\n\\n` +
    `Complete this task as helpfully as possible. ` +
    `If the task requires information that is not available, ` +
    `clearly state what information is needed. ` +
    `Do not claim to have completed real-world actions you cannot actually perform.`;
"""

new = """  const taskPrompt =
    `You are working as an AI employee for a project.\\n\\n` +
    `Project: ${project.name}\\n` +
    `Description: ${project.description || "No description provided."}\\n` +
    `Context: ${project.context || "No additional context provided."}\\n` +
    `Task: ${nextTask.title}\\n\\n` +
    `Complete this task as helpfully as possible using the project description and context. ` +
    `If the task requires information that is not available, ` +
    `clearly state what information is needed. ` +
    `Do not claim to have completed real-world actions you cannot actually perform.`;
"""

if old not in s:
    print("ERROR: Task prompt not found")
    raise SystemExit(1)

p.write_text(s.replace(old, new, 1))
print("Project context connected to task execution.")
