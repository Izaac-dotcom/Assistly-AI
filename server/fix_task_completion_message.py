from pathlib import Path

p = Path("server.js")
s = p.read_text()

old = '''return res.json({
reply:
`Completed "${nextTask.title}" for the "${project.name}" project.\\n\\n` +
taskResponse.text +
`\\n\\nProject progress: ${completed}/${project.tasks.length} tasks completed (${progress}%).` +
(followingTask
? `\\nNext task: ${followingTask.title}`
: `\\nAll tasks in "${project.name}" are completed!`),
task: nextTask,
project,
});'''

new = '''const completionMessage = nextTask.completed
? `Completed "${nextTask.title}" for the "${project.name}" project.`
: `Worked on "${nextTask.title}" for the "${project.name}" project, but it needs more information before it can be completed.`;

return res.json({
reply:
completionMessage +
`\\n\\n` +
taskResponse.text +
`\\n\\nProject progress: ${completed}/${project.tasks.length} tasks completed (${progress}%).` +
(followingTask
? `\\nNext task: ${followingTask.title}`
: `\\nAll tasks in "${project.name}" are completed!`),
task: nextTask,
project,
});'''

if old not in s:
    print("ERROR: exact response block not found")
    raise SystemExit(1)

p.write_text(s.replace(old, new, 1))
print("Task completion message fixed.")
