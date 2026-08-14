from pathlib import Path

p = Path("server.js")
s = p.read_text()

marker = "// NEXT PROJECT TASK"

if marker not in s:
    print("ERROR: NEXT PROJECT TASK marker not found")
    raise SystemExit(1)

block = r'''// WORK ON NEXT PROJECT TASK
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

  return res.json({
    reply:
      `I'll work on "${nextTask.title}" for the "${project.name}" project. ` +
      `This is task ${project.tasks.indexOf(nextTask) + 1} of ${project.tasks.length}.`,
    task: nextTask,
    project,
  });
}

'''

p.write_text(s.replace(marker, block + marker, 1))
print("Added work-on-next-task feature")
