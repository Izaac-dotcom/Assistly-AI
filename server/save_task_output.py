from pathlib import Path

p = Path("server.js")
s = p.read_text()

old = '''  return res.json({
    reply:
      `Working on "${nextTask.title}" for the "${project.name}" project.\\n\\n` +
      taskResponse.text,
    task: nextTask,
    project,
  });
'''

new = '''  nextTask.output = taskResponse.text;
  nextTask.completed = true;

  fs.writeFileSync(
    projectsFile,
    JSON.stringify(projects, null, 2)
  );

  const completed = project.tasks.filter(
    (task) => task.completed
  ).length;

  const progress = Math.round(
    (completed / project.tasks.length) * 100
  );

  const followingTask = project.tasks.find(
    (task) => !task.completed
  );

  return res.json({
    reply:
      `Completed "${nextTask.title}" for the "${project.name}" project.\\n\\n` +
      taskResponse.text +
      `\\n\\nProject progress: ${completed}/${project.tasks.length} tasks completed (${progress}%).` +
      (followingTask
        ? `\\nNext task: ${followingTask.title}`
        : `\\nAll tasks in "${project.name}" are completed!`),
    task: nextTask,
    project,
  });
'''

if old not in s:
    print("ERROR: exact task response block not found")
    raise SystemExit(1)

p.write_text(s.replace(old, new, 1))
print("Task output saving added.")