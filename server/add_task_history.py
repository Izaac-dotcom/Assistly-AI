from pathlib import Path

p = Path("server.js")
s = p.read_text()

old = '''  const taskPrompt =
    `You are working as an AI employee for a project.\\n\\n` +
    `Project: ${project.name}\\n` +
    `Description: ${project.description || "No description provided."}\\n` +
    `Context: ${project.context || "No additional context provided."}\\n` +
    `Task: ${nextTask.title}\\n\\n` +
    `Complete this task as helpfully as possible using the project description and context. ` +
    `If the task requires information that is not available, ` +
    `clearly state what information is needed. ` +
    `Do not claim to have completed real-world actions you cannot actually perform.`;
'''

new = '''  const completedTaskHistory = project.tasks
    .filter((task) => task.completed && task.output)
    .map(
      (task, index) =>
        `${index + 1}. ${task.title}\\nOutput:\\n${task.output}`
    )
    .join("\\n\\n");

  const taskPrompt =
    `You are working as an AI employee for a project.\\n\\n` +
    `Project: ${project.name}\\n` +
    `Description: ${project.description || "No description provided."}\\n` +
    `Context: ${project.context || "No additional context provided."}\\n\\n` +
    `Previous completed work:\\n${completedTaskHistory || "No previous task outputs available."}\\n\\n` +
    `Current task: ${nextTask.title}\\n\\n` +
    `Use the previous completed work as input for the current task. ` +
    `If the current task is a review, improvement, or follow-up task, ` +
    `review and build upon the previous outputs instead of asking the user ` +
    `to provide work that already exists in the project history. ` +
    `Complete this task as helpfully as possible. ` +
    `If information is genuinely missing, clearly state what is needed. ` +
    `Do not claim to have completed real-world actions you cannot actually perform.`;
'''

if old not in s:
    print("ERROR: taskPrompt block not found")
    raise SystemExit(1)

p.write_text(s.replace(old, new, 1))
print("Task history added.")
