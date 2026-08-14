from pathlib import Path

p = Path("server.js")
s = p.read_text()

start_marker = "// WORK ON NEXT PROJECT TASK"
end_marker = "// NEXT PROJECT TASK"

start = s.index(start_marker)
end = s.index(end_marker, start)

new_block = r'''// WORK ON NEXT PROJECT TASK
if (
  lowerMessage.includes("work on the next task") ||
  lowerMessage.includes("work on next task") ||
  lowerMessage.includes("start the next task") ||
  lowerMessage.includes("start next task")
) {
  const projectName = message
    .replace(/^.*?next task(?: for| on)?[:\s]*/i, "")
    .replace(/[.!?]+$/, "")
    .trim();

  const project = projects.find(
    (project) =>
      project.name.toLowerCase() === projectName.toLowerCase()
  );

  if (!project) {
    return res.json({
      reply: `I couldn't find a project called "${projectName}".`,
    });
  }

  const nextTask = project.tasks.find((task) => !task.completed);

  if (!nextTask) {
    return res.json({
      reply: `All tasks in "${project.name}" are already completed!`,
      project,
    });
  }

  const taskPrompt =
    `You are working as an AI employee for a project.\n\n` +
    `Project: ${project.name}\n` +
    `Task: ${nextTask.title}\n\n` +
    `Complete this task as helpfully as possible. ` +
    `If the task requires information that is not available, ` +
    `clearly state what information is needed. ` +
    `Do not claim to have completed real-world actions you cannot actually perform.`;

  const taskResponse = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    systemInstruction:
      "You are Assistly AI, an AI employee. Perform project tasks carefully, " +
      "produce useful work, and be honest about limitations.",
    contents: taskPrompt,
  });

  return res.json({
    reply:
      `Working on "${nextTask.title}" for the "${project.name}" project.\n\n` +
      taskResponse.text,
    task: nextTask,
    project,
  });
}

'''

p.write_text(s[:start] + new_block + s[end:])
print("Task execution upgraded")
