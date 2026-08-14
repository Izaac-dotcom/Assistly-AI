const fs = require("fs");
const path = require("path");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = 3001;

// ============================================================
// CONFIGURATION
// ============================================================

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

const tasksFile = path.join(__dirname, "tasks.json");
const calendarFile = path.join(__dirname, "calendar.json");
const projectsFile = path.join(__dirname, "projects.json");

// ============================================================
// DATA
// ============================================================

let tasks = [];
let calendar = [];
let projects = [];

const conversationHistory = [];

let pendingProjectDescription = null;

// ============================================================
// LOAD DATA
// ============================================================

function loadJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    const raw = fs.readFileSync(file, "utf8");

    if (!raw.trim()) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(`Could not load ${file}:`, error);
    return fallback;
  }
}

tasks = loadJsonFile(tasksFile, []);
calendar = loadJsonFile(calendarFile, []);
projects = loadJsonFile(projectsFile, []);

// ============================================================
// SAVE DATA
// ============================================================

function saveTasks() {
  fs.writeFileSync(
    tasksFile,
    JSON.stringify(tasks, null, 2)
  );
}

function saveCalendar() {
  fs.writeFileSync(
    calendarFile,
    JSON.stringify(calendar, null, 2)
  );
}

function saveProjects() {
  fs.writeFileSync(
    projectsFile,
    JSON.stringify(projects, null, 2)
  );
}

// ============================================================
// AI
// ============================================================

const ai = new GoogleGenAI({
  apiKey: process.env.AI_API_KEY,
});

console.log(
  "API key loaded:",
  !!process.env.AI_API_KEY
);

console.log(
  "Gemini model:",
  GEMINI_MODEL
);

// ============================================================
// EXPRESS
// ============================================================

app.use(cors());
app.use(express.json());

// ============================================================
// HELPERS
// ============================================================

function cleanText(value) {
  return String(value || "")
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

function getTodayDate() {
  const now = new Date();

  return now.toISOString().split("T")[0];
}

function getTomorrowDate() {
  const tomorrow = new Date();

  tomorrow.setDate(
    tomorrow.getDate() + 1
  );

  return tomorrow
    .toISOString()
    .split("T")[0];
}

function parseTime(text) {
  const match = String(text || "").match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  );

  if (!match) {
    return null;
  }

  let hour = parseInt(match[1], 10);
  const minute = match[2] || "00";
  const period = match[3].toLowerCase();

  if (hour < 1 || hour > 12) {
    return null;
  }

  if (period === "pm" && hour !== 12) {
    hour += 12;
  }

  if (period === "am" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function parseRelativeDate(text) {
  const lower = String(text || "").toLowerCase();

  if (lower.includes("today")) {
    return getTodayDate();
  }

  if (lower.includes("tomorrow")) {
    return getTomorrowDate();
  }

  return null;
}

function findProjectByName(name) {
  const normalized = cleanText(name).toLowerCase();

  return projects.find(
    (project) =>
      project.name.toLowerCase() === normalized
  );
}

function findProjectMentionedInMessage(message) {
  const lower = message.toLowerCase();

  return projects.find((project) =>
    lower.includes(project.name.toLowerCase())
  );
}

function getMostRecentActiveProject() {
  const activeProjects = projects.filter(
    (project) => project.status === "active"
  );

  if (activeProjects.length > 0) {
    return activeProjects[activeProjects.length - 1];
  }

  return projects.length > 0
    ? projects[projects.length - 1]
    : null;
}

function getProjectProgress(project) {
  const total = project.tasks.length;

  const completed = project.tasks.filter(
    (task) => task.completed
  ).length;

  const progress =
    total === 0
      ? 0
      : Math.round((completed / total) * 100);

  return {
    total,
    completed,
    progress,
  };
}

function getNextProjectTask(project) {
  return project.tasks.find(
    (task) => !task.completed
  );
}

function getProjectTaskHistory(project) {
  return project.tasks
    .filter(
      (task) =>
        task.completed &&
        task.output
    )
    .map(
      (task, index) =>
        `${index + 1}. ${task.title}\n\n${task.output}`
    )
    .join("\n\n------------------------------\n\n");
}

function stripTaskStatus(text) {
  return String(text || "")
    .replace(
      /^\s*TASK_STATUS\s*:\s*(COMPLETE|NEEDS_INFO)\s*$/gim,
      ""
    )
    .trim();
}

function parseTaskStatus(text) {
  const match = String(text || "").match(
    /TASK_STATUS\s*:\s*(COMPLETE|NEEDS_INFO)/i
  );

  if (!match) {
    return null;
  }

  return match[1].toUpperCase();
}

// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {
  res.json({
    message: "Assistly AI backend is running!",
  });
});

// ============================================================
// PROJECT API
// ============================================================

app.get("/api/projects", (req, res) => {
  res.json({
    projects,
  });
});

// ============================================================
// TASK API
// ============================================================

app.get("/api/tasks", (req, res) => {
  res.json({
    tasks,
  });
});

app.post("/api/tasks", (req, res) => {
  const { title } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({
      error: "Task title is required.",
    });
  }

  const task = {
    id: Date.now(),
    title: title.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };

  tasks.push(task);

  saveTasks();

  return res.json({
    reply: `Done! I've added "${task.title}" to your tasks.`,
    task,
  });
});

app.patch("/api/tasks/:id", (req, res) => {
  const taskId = Number(req.params.id);
  const { completed } = req.body;

  const task = tasks.find((item) => item.id === taskId);

  if (!task) {
    return res.status(404).json({
      error: "Task not found.",
    });
  }

  task.completed = Boolean(completed);

  saveTasks();

  return res.json({
    message: task.completed
      ? "Task completed."
      : "Task marked incomplete.",
    task,
  });
});

app.patch("/api/projects/:projectId/tasks/:taskId", (req, res) => {
  const projectId = Number(req.params.projectId);
  const taskId = Number(req.params.taskId);
  const { completed } = req.body;

  const project = projects.find((item) => item.id === projectId);

  if (!project) {
    return res.status(404).json({
      error: "Project not found.",
    });
  }

  const task = project.tasks.find((item) => item.id === taskId);

  if (!task) {
    return res.status(404).json({
      error: "Project task not found.",
    });
  }

  task.completed = Boolean(completed);

  saveProjects();

  return res.json({
    message: task.completed
      ? "Project task completed."
      : "Project task marked incomplete.",
    project,
  });
});

// ============================================================
// CHAT
// ============================================================

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.json({
      reply: "Please enter a message.",
    });
  }

  const lowerMessage = message
    .toLowerCase()
    .trim();
// ========================================================
// PENDING PROJECT DESCRIPTION
// ========================================================

if (pendingProjectDescription) {
  const project = projects.find(
    (item) =>
      item.id === pendingProjectDescription.projectId
  );

  if (project) {
    project.description = message.trim();

    saveProjects();

    pendingProjectDescription = null;

    return res.json({
      reply:
        `Got it! I've saved that as the description for "${project.name}".\n\n` +
        `Description: ${project.description}\n\n` +
        `You can now ask me to plan the project.`,

      project,
    });
  }

  pendingProjectDescription = null;
}
  try {
    // ========================================================
    // VIEW CALENDAR
    // ========================================================

    if (
      lowerMessage.includes(
        "what's on my calendar"
      ) ||
      lowerMessage.includes(
        "whats on my calendar"
      ) ||
      lowerMessage.includes(
        "show my calendar"
      ) ||
      lowerMessage.includes(
        "view my calendar"
      )
    ) {
      if (calendar.length === 0) {
        return res.json({
          reply: "Your calendar is empty.",
        });
      }

      const calendarList = calendar
        .map((event, index) => {
          let details = event.title;

          if (event.date) {
            details += ` — ${event.date}`;
          }

          if (event.time) {
            details += ` at ${event.time}`;
          }

          return `${index + 1}. ${details}`;
        })
        .join("\n");

      return res.json({
        reply:
          `Here is your calendar:\n${calendarList}`,
        calendar,
      });
    }

    // ========================================================
    // SCHEDULE EVENT
    // ========================================================

    if (
      lowerMessage.startsWith("schedule") ||
      lowerMessage.startsWith("add an event")
    ) {
      let eventText = message
        .replace(
          /^schedule[:\s]*/i,
          ""
        )
        .replace(
          /^add an event[:\s]*/i,
          ""
        )
        .trim();

      const eventDate =
        parseRelativeDate(message);

      const eventTime =
        parseTime(message);

      eventText = eventText
        .replace(
          /\s+(today|tomorrow)\b.*$/i,
          ""
        )
        .replace(
          /\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)\b.*$/i,
          ""
        )
        .replace(/[.!?]+$/, "")
        .trim();

      if (!eventText) {
        return res.json({
          reply:
            "What would you like me to schedule?",
        });
      }

      const event = {
        id: Date.now(),
        title: eventText,
        date: eventDate,
        time: eventTime,
        createdAt: new Date().toISOString(),
      };

      calendar.push(event);

      saveCalendar();

      return res.json({
        reply:
          `Done! I've scheduled "${event.title}".`,
        event,
      });
    }

    // ========================================================
    // NATURAL LANGUAGE CALENDAR EVENT
    // ========================================================

    if (
      lowerMessage.includes("meeting") ||
      lowerMessage.includes("appointment") ||
      lowerMessage.includes("call") ||
      lowerMessage.includes("event")
    ) {
      const eventDate =
        parseRelativeDate(message);

      const eventTime =
        parseTime(message);

      if (eventDate) {
        let eventTitle = message
          .replace(
            /^i have (a|an)\s+/i,
            ""
          )
          .replace(
            /^i have to\s+/i,
            ""
          )
          .replace(
            /^there is\s+/i,
            ""
          )
          .replace(
            /\s+(today|tomorrow)\b.*$/i,
            ""
          )
          .replace(
            /\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)\b.*$/i,
            ""
          )
          .replace(/[.!?]+$/, "")
          .trim();

        if (eventTitle) {
          const event = {
            id: Date.now(),
            title: eventTitle,
            date: eventDate,
            time: eventTime,
            createdAt:
              new Date().toISOString(),
          };

          calendar.push(event);

          saveCalendar();

          return res.json({
            reply:
              `I've added "${eventTitle}" to your calendar.`,
            event,
          });
        }
      }
    }

    // ========================================================
    // RESCHEDULE CALENDAR EVENT
    // ========================================================

    if (
      lowerMessage.startsWith(
        "reschedule my event"
      ) ||
      lowerMessage.startsWith(
        "reschedule the event"
      )
    ) {
      const match = message.match(
        /^reschedule (?:my|the) event (.+?) to (.+)$/i
      );

      if (!match) {
        return res.json({
          reply:
            "Tell me which event you want to reschedule and the new time.",
        });
      }

      const oldTitle = cleanText(match[1]);
      const newDetails = match[2].trim();

      const event = calendar.find(
        (item) =>
          item.title.toLowerCase() ===
          oldTitle.toLowerCase()
      );

      if (!event) {
        return res.json({
          reply:
            `I couldn't find a calendar event called "${oldTitle}".`,
        });
      }

      const newDate =
        parseRelativeDate(newDetails);

      const newTime =
        parseTime(newDetails);

      if (newDate) {
        event.date = newDate;
      }

      if (newTime) {
        event.time = newTime;
      }

      saveCalendar();

      return res.json({
        reply:
          `Done! I've rescheduled "${event.title}" to ` +
          `${event.date || "the selected date"} ` +
          `${event.time ? `at ${event.time}` : ""}.`,
        event,
      });
    }

    // ========================================================
    // DELETE CALENDAR EVENT
    // ========================================================

    if (
      lowerMessage.startsWith(
        "delete my event"
      ) ||
      lowerMessage.startsWith(
        "delete the event"
      ) ||
      lowerMessage.startsWith(
        "cancel my event"
      ) ||
      lowerMessage.startsWith(
        "cancel the event"
      )
    ) {
      const title = message
        .replace(
          /^delete my event[:\s]*/i,
          ""
        )
        .replace(
          /^delete the event[:\s]*/i,
          ""
        )
        .replace(
          /^cancel my event[:\s]*/i,
          ""
        )
        .replace(
          /^cancel the event[:\s]*/i,
          ""
        )
        .trim();

      const eventIndex = calendar.findIndex(
        (event) =>
          event.title.toLowerCase() ===
          title.toLowerCase()
      );

      if (eventIndex === -1) {
        return res.json({
          reply:
            `I couldn't find a calendar event called "${title}".`,
        });
      }

      const deletedEvent =
        calendar.splice(eventIndex, 1)[0];

      saveCalendar();

      return res.json({
        reply:
          `Done! I've deleted "${deletedEvent.title}" from your calendar.`,
      });
    }

    // ========================================================
    // DELETE TASK
    // ========================================================

    if (
      lowerMessage.startsWith(
        "delete my task"
      ) ||
      lowerMessage.startsWith(
        "delete the task"
      )
    ) {
      const title = message
        .replace(
          /^delete my task[:\s]*/i,
          ""
        )
        .replace(
          /^delete the task[:\s]*/i,
          ""
        )
        .trim();

      const taskIndex = tasks.findIndex(
        (task) =>
          task.title.toLowerCase() ===
          title.toLowerCase()
      );

      if (taskIndex === -1) {
        return res.json({
          reply:
            `I couldn't find a task called "${title}".`,
        });
      }

      const deletedTask =
        tasks.splice(taskIndex, 1)[0];

      saveTasks();

      return res.json({
        reply:
          `Done! I've deleted "${deletedTask.title}".`,
      });
    }

    // ========================================================
    // COMPLETE TASK
    // ========================================================

    if (
      lowerMessage.startsWith(
        "complete my task"
      ) ||
      lowerMessage.startsWith(
        "complete the task"
      ) ||
      lowerMessage.startsWith(
        "complete my "
      )
    ) {
      const title = message
        .replace(
          /^complete my task[:\s]*/i,
          ""
        )
        .replace(
          /^complete the task[:\s]*/i,
          ""
        )
        .replace(
          /^complete my[:\s]*/i,
          ""
        )
        .trim();

      const task = tasks.find(
        (item) =>
          item.title.toLowerCase() ===
          title.toLowerCase()
      );

      if (!task) {
        return res.json({
          reply:
            `I couldn't find a task called "${title}".`,
        });
      }

      task.completed = true;
      task.completedAt =
        new Date().toISOString();

      saveTasks();

      return res.json({
        reply:
          `Done! I've marked "${task.title}" as completed.`,
        task,
      });
    }

    // ========================================================
    // VIEW TASKS
    // ========================================================

    if (
      lowerMessage.includes(
        "what are my tasks"
      ) ||
      lowerMessage.includes(
        "show my tasks"
      ) ||
      lowerMessage.includes(
        "list my tasks"
      )
    ) {
      if (tasks.length === 0) {
        return res.json({
          reply:
            "You don't have any tasks yet.",
        });
      }

      const taskList = tasks
        .map(
          (task, index) =>
            `${index + 1}. ${task.title} — ${
              task.completed
                ? "Completed"
                : "Not completed"
            }`
        )
        .join("\n");

      return res.json({
        reply:
          `Here are your tasks:\n${taskList}`,
        tasks,
      });
    }

    // ========================================================
    // NATURAL LANGUAGE TASK
    // ========================================================

    if (
      lowerMessage.startsWith(
        "i need to "
      ) ||
      lowerMessage.startsWith(
        "i have to "
      ) ||
      lowerMessage.startsWith(
        "remind me to "
      ) ||
      lowerMessage.startsWith(
        "don't let me forget to "
      )
    ) {
      const title = message
        .replace(
          /^i need to\s+/i,
          ""
        )
        .replace(
          /^i have to\s+/i,
          ""
        )
        .replace(
          /^remind me to\s+/i,
          ""
        )
        .replace(
          /^don't let me forget to\s+/i,
          ""
        )
        .replace(/[.!?]+$/, "")
        .trim();

      if (title) {
        const task = {
          id: Date.now(),
          title,
          completed: false,
          createdAt:
            new Date().toISOString(),
        };

        tasks.push(task);

        saveTasks();

        return res.json({
          reply:
            `I've added "${title}" to your tasks.`,
          task,
        });
      }
    }

    // ========================================================
    // ADD TASK TO PROJECT
    // ========================================================

    if (
      lowerMessage.startsWith("add ") &&
      lowerMessage.includes(" to my ") &&
      lowerMessage.includes(" project")
    ) {
      const match = message.match(
        /^add\s+(.+?)\s+to\s+my\s+(.+?)\s+project[.!?]*$/i
      );

      if (match) {
        const taskTitle =
          match[1].trim();

        const projectName =
          match[2].trim();

        const project =
          findProjectByName(
            projectName
          );

        if (!project) {
          return res.json({
            reply:
              `I couldn't find a project called "${projectName}".`,
          });
        }

        const projectTask = {
          id: Date.now(),
          title: taskTitle,
          completed: false,
          output: null,
          createdAt:
            new Date().toISOString(),
        };

        project.tasks.push(
          projectTask
        );

        saveProjects();

        return res.json({
          reply:
            `I've added "${taskTitle}" to the "${project.name}" project.`,
          project,
        });
      }
    }

    // ========================================================
    // ADD TASK
    // ========================================================

    if (
      lowerMessage.startsWith(
        "add a task"
      ) ||
      lowerMessage.startsWith(
        "create a task"
      )
    ) {
      const title = message
        .replace(
          /^add a task[:\s]*/i,
          ""
        )
        .replace(
          /^create a task[:\s]*/i,
          ""
        )
        .trim();

      if (!title) {
        return res.json({
          reply:
            "What task would you like me to add?",
        });
      }

      const task = {
        id: Date.now(),
        title,
        completed: false,
        createdAt:
          new Date().toISOString(),
      };

      tasks.push(task);

      saveTasks();

      return res.json({
        reply:
          `Done! I've added "${title}" to your tasks.`,
        task,
      });
    }

    // ========================================================
    // SET PROJECT DESCRIPTION
    // ========================================================

    if (
      lowerMessage.startsWith(
        "describe my project"
      ) ||
      lowerMessage.startsWith(
        "describe the project"
      )
    ) {
      const match = message.match(
        /^describe (?:my|the) project\s+(.+?)\s+(?:as|:)\s+(.+)$/i
      );

      if (!match) {
        return res.json({
          reply:
            "Use: Describe my project [project name] as [description].",
        });
      }

      const projectName =
        match[1].trim();

      const description =
        match[2].trim();

      const project =
        findProjectByName(
          projectName
        );

      if (!project) {
        return res.json({
          reply:
            `I couldn't find a project called "${projectName}".`,
        });
      }

      project.description =
        description;

      saveProjects();

      return res.json({
        reply:
          `I've updated the description for "${project.name}".\n\n` +
          `Description: ${project.description}`,
        project,
      });
    }

    // ========================================================
    // VIEW ALL PROJECTS
    // ========================================================

    if (
      lowerMessage ===
        "show my projects" ||
      lowerMessage ===
        "view my projects" ||
      lowerMessage ===
        "list my projects"
    ) {
      if (projects.length === 0) {
        return res.json({
          reply:
            "You don't have any projects yet.",
          projects: [],
        });
      }

      const projectList = projects
        .map((project, index) => {
          const {
            total,
            completed,
            progress,
          } = getProjectProgress(
            project
          );

          const nextTask =
            getNextProjectTask(
              project
            );

          const nextTaskText =
            nextTask
              ? `Next: ${nextTask.title}`
              : "All tasks completed!";

          return (
            `${index + 1}. ${project.name} — ` +
            `${progress}% complete ` +
            `(${completed}/${total})\n` +
            `   ${nextTaskText}`
          );
        })
        .join("\n");

      return res.json({
        reply:
          `Your Projects:\n\n${projectList}`,
        projects,
      });
    }

    // ========================================================
    // VIEW REMAINING PROJECT TASKS
    // ========================================================

    if (
      lowerMessage.startsWith(
        "what's left to do on"
      ) ||
      lowerMessage.startsWith(
        "what is left to do on"
      ) ||
      lowerMessage.startsWith(
        "what's left on"
      )
    ) {
      const projectName = message
        .replace(
          /^what's left to do on[:\s]*/i,
          ""
        )
        .replace(
          /^what is left to do on[:\s]*/i,
          ""
        )
        .replace(
          /^what's left on[:\s]*/i,
          ""
        )
        .replace(/[.!?]+$/, "")
        .trim();

      const project =
        findProjectByName(
          projectName
        );

      if (!project) {
        return res.json({
          reply:
            `I couldn't find a project called "${projectName}".`,
        });
      }

      const remainingTasks =
        project.tasks.filter(
          (task) => !task.completed
        );

      if (remainingTasks.length === 0) {
        return res.json({
          reply:
            `There are no remaining tasks in "${project.name}". The project is complete!`,
          project,
        });
      }

      const taskList =
        remainingTasks
          .map(
            (task, index) =>
              `${index + 1}. ${task.title}`
          )
          .join("\n");

      return res.json({
        reply:
          `Here's what's left to do on "${project.name}":\n\n${taskList}`,
        project,
      });
    }

    // ========================================================
    // WORK ON NEXT PROJECT TASK
    // ========================================================

    if (
      lowerMessage.includes(
        "work on the next task"
      ) ||
      lowerMessage.includes(
        "work on next task"
      ) ||
      lowerMessage.includes(
        "start the next task"
      ) ||
      lowerMessage.includes(
        "start next task"
      ) ||
      lowerMessage.includes(
        "complete and deliver the project"
      ) ||
      lowerMessage.includes(
        "complete and deliver my project"
      ) ||
      lowerMessage.includes(
        "finish and deliver the project"
      ) ||
      lowerMessage.includes(
        "finish the project"
      ) ||
      lowerMessage.includes(
        "deliver the project"
      )
    ) {
      const isFinalDeliveryCommand =
        lowerMessage.includes(
          "complete and deliver the project"
        ) ||
        lowerMessage.includes(
          "complete and deliver my project"
        ) ||
        lowerMessage.includes(
          "finish and deliver the project"
        ) ||
        lowerMessage.includes(
          "finish the project"
        ) ||
        lowerMessage.includes(
          "deliver the project"
        );

      let project = null;

      // ------------------------------------------------------
      // Find project
      // ------------------------------------------------------

      if (isFinalDeliveryCommand) {
        project =
          findProjectMentionedInMessage(
            message
          );

        if (!project) {
          project =
            getMostRecentActiveProject();
        }
      } else {
        let projectName = message
          .replace(
            /^.*?next task(?:\s+for|\s+on)?[:\s]*/i,
            ""
          )
          .replace(/[.!?]+$/, "")
          .trim();

        project =
          findProjectByName(
            projectName
          );

        // If only one project exists,
        // automatically use it.
        if (
          !project &&
          projects.length === 1
        ) {
          project = projects[0];
        }

        // Otherwise use the project
        // explicitly mentioned.
        if (!project) {
          project =
            findProjectMentionedInMessage(
              message
            );
        }
      }

      if (!project) {
        return res.json({
          reply:
            "I couldn't determine which project you want me to work on.",
        });
      }

      // ------------------------------------------------------
      // Find next task
      // ------------------------------------------------------

      const nextTask =
        getNextProjectTask(
          project
        );

      if (!nextTask) {
        return res.json({
          reply:
            `All tasks in "${project.name}" are already completed!`,
          project,
        });
      }

      // ------------------------------------------------------
      // Previous work
      // ------------------------------------------------------

      const completedTaskHistory =
        getProjectTaskHistory(
          project
        );

      // ------------------------------------------------------
      // Final delivery detection
      // ------------------------------------------------------

      const isFinalDeliveryTask =
        nextTask.title
          .toLowerCase()
          .includes("complete") &&
        nextTask.title
          .toLowerCase()
          .includes("deliver");

      // ------------------------------------------------------
      // Prompt
      // ------------------------------------------------------

      let taskPrompt =
        `You are Assistly AI, an AI employee working on a project.\n\n` +

        `PROJECT NAME:\n${project.name}\n\n` +

        `PROJECT DESCRIPTION:\n` +
        `${project.description || "No description provided."}\n\n` +

        `PROJECT CONTEXT:\n` +
        `${project.context || "No additional context provided."}\n\n` +

        `CURRENT TASK:\n` +
        `${nextTask.title}\n\n` +

        `PREVIOUS COMPLETED WORK:\n` +
        `${
          completedTaskHistory ||
          "No previous completed task outputs are available."
        }\n\n`;

      if (isFinalDeliveryTask) {
        taskPrompt +=
          `FINAL DELIVERY INSTRUCTIONS:\n` +
          `You are performing the final project task.\n\n` +

          `Use ALL useful completed task outputs above as source material.\n` +

          `Do NOT ask the user to repeat project information that already exists above.\n` +

          `Do NOT say you lack access to previous task outputs.\n` +

          `Consolidate the previous work into a professional final Project Delivery & Completion Report.\n\n` +

          `The report should include:\n` +
          `1. Project overview\n` +
          `2. Project goals\n` +
          `3. Completed tasks\n` +
          `4. Major deliverables\n` +
          `5. Important findings\n` +
          `6. Recommendations\n` +
          `7. Project status\n` +
          `8. Completion summary\n\n` +

          `IMPORTANT:\n` +
          `You may say the project work is complete only if all project tasks will be completed after this task.\n` +

          `Do NOT claim that you uploaded, emailed, deployed, submitted, or physically delivered anything unless an actual tool performed that action.\n\n`;
      } else {
        taskPrompt +=
          `TASK INSTRUCTIONS:\n` +

          `Complete the current task using the project description, context, and previous completed work.\n\n` +

          `If previous task outputs contain useful information, build directly on them.\n\n` +

          `Do NOT ask the user for information that is already available in the project description, project context, previous task outputs, or current task.\n\n` +

          `Do not restart work that has already been completed.\n\n` +

          `Complete the task as helpfully and professionally as possible.\n\n` +

          `Only say information is genuinely required if the task truly cannot be completed without it.\n\n` +

          `Do not claim to perform real-world actions that you cannot actually perform.\n\n`;
      }

      // ------------------------------------------------------
      // Explicit task status instruction
      // ------------------------------------------------------

      taskPrompt +=
        `TASK STATUS REQUIREMENT:\n` +
        `At the very end of your response, write exactly ONE of these lines:\n\n` +
        `TASK_STATUS: COMPLETE\n` +
        `or\n` +
        `TASK_STATUS: NEEDS_INFO\n\n` +

        `Use TASK_STATUS: COMPLETE when you have produced a useful deliverable for the current task.\n` +

        `Use TASK_STATUS: NEEDS_INFO only when genuinely necessary information prevents meaningful completion.\n\n`;

      // ------------------------------------------------------
      // AI request
      // ------------------------------------------------------

      const taskResponse =
        await ai.models.generateContent({
          model: GEMINI_MODEL,

          systemInstruction:
            "You are Assistly AI, an AI employee. " +
            "Perform project tasks carefully. " +
            "Use existing project information before asking questions. " +
            "Produce useful work. " +
            "Never falsely claim real-world actions.",

          contents: taskPrompt,
        });

      const rawTaskOutput =
        taskResponse.text || "";

      const taskStatus =
        parseTaskStatus(
          rawTaskOutput
        );

      const cleanOutput =
        stripTaskStatus(
          rawTaskOutput
        );

      nextTask.output =
        cleanOutput;

      // ------------------------------------------------------
      // Determine completion
      // ------------------------------------------------------

      if (
        taskStatus === "COMPLETE"
      ) {
        nextTask.completed =
          true;

        nextTask.completedAt =
          new Date().toISOString();
      } else if (
        taskStatus === "NEEDS_INFO"
      ) {
        nextTask.completed =
          false;
      } else {
        // If Gemini forgot the marker,
        // judge based on whether it produced
        // meaningful output instead of looking
        // for random phrases like "please provide".
        nextTask.completed =
          cleanOutput.length >= 100;
      }

      // ------------------------------------------------------
      // Final project status
      // ------------------------------------------------------

      const allTasksCompleted =
        project.tasks.length > 0 &&
        project.tasks.every(
          (task) => task.completed
        );

      if (allTasksCompleted) {
        project.status =
          "completed";

        project.completedAt =
          new Date().toISOString();
      } else {
        project.status =
          "active";
      }

      saveProjects();

      // ------------------------------------------------------
      // Progress
      // ------------------------------------------------------

      const {
        total,
        completed,
        progress,
      } = getProjectProgress(
        project
      );

      const followingTask =
        getNextProjectTask(
          project
        );

      // ------------------------------------------------------
      // Response
      // ------------------------------------------------------

      let reply;

      if (nextTask.completed) {
        reply =
          `Completed "${nextTask.title}" for the "${project.name}" project.\n\n` +
          `${cleanOutput}`;
      } else {
        reply =
          `Worked on "${nextTask.title}" for the "${project.name}" project, but more information is needed before it can be completed.\n\n` +
          `${cleanOutput}`;
      }

      reply +=
        `\n\nProject progress: ${completed}/${total} tasks completed (${progress}%).`;

      if (followingTask) {
        reply +=
          `\nNext task: ${followingTask.title}`;
      } else {
        reply +=
          `\nAll tasks in "${project.name}" are completed!`;
      }

      return res.json({
        reply,
        task: nextTask,
        project,
      });
    }

    // ========================================================
    // NEXT PROJECT TASK
    // ========================================================

    if (
      lowerMessage.includes(
        "next task"
      )
    ) {
      let projectName = message
        .replace(
          /^.*?next task(?:\s+for|\s+on)?[:\s]*/i,
          ""
        )
        .replace(/[.!?]+$/, "")
        .trim();

      let project =
        findProjectByName(
          projectName
        );

      if (!project && projects.length === 1) {
        project = projects[0];
      }

      if (!project) {
        project =
          findProjectMentionedInMessage(
            message
          );
      }

      if (!project) {
        return res.json({
          reply:
            "I couldn't determine which project you mean.",
        });
      }

      const nextTask =
        getNextProjectTask(
          project
        );

      if (!nextTask) {
        return res.json({
          reply:
            `All tasks in "${project.name}" are completed!`,
          project,
        });
      }

      return res.json({
        reply:
          `Your next task for "${project.name}" is: ${nextTask.title}`,
        task: nextTask,
        project,
      });
    }

    // ========================================================
    // VIEW PROJECT
    // ========================================================

    if (
      lowerMessage.startsWith(
        "show my project"
      ) ||
      lowerMessage.startsWith(
        "show the project"
      ) ||
      lowerMessage.startsWith(
        "view my project"
      ) ||
      lowerMessage.startsWith(
        "view the project"
      )
    ) {
      const projectName = message
        .replace(
          /^show my project[:\s]*/i,
          ""
        )
        .replace(
          /^show the project[:\s]*/i,
          ""
        )
        .replace(
          /^view my project[:\s]*/i,
          ""
        )
        .replace(
          /^view the project[:\s]*/i,
          ""
        )
        .replace(/[.!?]+$/, "")
        .trim();

      const project =
        findProjectByName(
          projectName
        );

      if (!project) {
        return res.json({
          reply:
            `I couldn't find a project called "${projectName}".`,
        });
      }

      const {
        total,
        completed,
        progress,
      } = getProjectProgress(
        project
      );

      if (total === 0) {
        return res.json({
          reply:
            `The "${project.name}" project doesn't have any tasks yet.`,
          project,
        });
      }

      const taskList =
        project.tasks
          .map(
            (task, index) =>
              `${index + 1}. ${task.title} — ${
                task.completed
                  ? "Completed"
                  : "Not completed"
              }`
          )
          .join("\n");

      return res.json({
        reply:
          `Project: ${project.name}\n` +
          `Status: ${project.status}\n` +
          `Progress: ${progress}%\n` +
          `${completed}/${total} tasks completed\n\n` +
          `Tasks:\n${taskList}`,
        project,
      });
    }

    // ========================================================
    // COMPLETE PROJECT TASK
    // ========================================================

    if (
      lowerMessage.startsWith("mark ") &&
      lowerMessage.includes(
        " as completed"
      ) &&
      lowerMessage.includes(
        " in my "
      ) &&
      lowerMessage.includes(
        " project"
      )
    ) {
      const match = message.match(
        /^mark\s+(.+?)\s+as\s+completed\s+in\s+my\s+(.+?)\s+project[.!?]*$/i
      );

      if (!match) {
        return res.json({
          reply:
            "Tell me which project task you want to mark as completed.",
        });
      }

      const taskTitle =
        match[1].trim();

      const projectName =
        match[2].trim();

      const project =
        findProjectByName(
          projectName
        );

      if (!project) {
        return res.json({
          reply:
            `I couldn't find a project called "${projectName}".`,
        });
      }

      const task =
        project.tasks.find(
          (item) =>
            item.title.toLowerCase() ===
            taskTitle.toLowerCase()
        );

      if (!task) {
        return res.json({
          reply:
            `I couldn't find a task called "${taskTitle}" in the "${project.name}" project.`,
        });
      }

      task.completed = true;
      task.completedAt =
        new Date().toISOString();

      const {
        total,
        completed,
        progress,
      } = getProjectProgress(
        project
      );

      const nextTask =
        getNextProjectTask(
          project
        );

      if (
        total > 0 &&
        completed === total
      ) {
        project.status =
          "completed";

        project.completedAt =
          new Date().toISOString();
      }

      saveProjects();

      return res.json({
        reply:
          `Marked "${task.title}" as completed in the "${project.name}" project. ` +
          `${completed}/${total} task(s) completed (${progress}%).` +
          (
            nextTask
              ? ` Next task: ${nextTask.title}`
              : " All tasks are completed!"
          ),
        project,
      });
    }

    // ============================================================
// PLAN PROJECT
// ============================================================

if (
  lowerMessage.startsWith("plan my project") ||
  lowerMessage.startsWith("plan the project") ||
  lowerMessage.startsWith("plan project")
) {
  const projectName = message
    .replace(
      /^plan my project[:\s]*/i,
      ""
    )
    .replace(
      /^plan the project[:\s]*/i,
      ""
    )
    .replace(
      /^plan project[:\s]*/i,
      ""
    )
    .replace(/[.!?]+$/, "")
    .trim();

  if (!projectName) {
    return res.json({
      reply:
        "Which project would you like me to plan?",
    });
  }

  const project =
    findProjectByName(projectName);

  if (!project) {
    return res.json({
      reply:
        `I couldn't find a project called "${projectName}".`,
    });
  }

  if (project.tasks.length > 0) {
    return res.json({
      reply:
        `The "${project.name}" project already has ${project.tasks.length} task(s). I won't overwrite them.`,
      project,
    });
  }

  // ----------------------------------------------------------
  // Ask Gemini to create a project-specific plan
  // ----------------------------------------------------------

  const planningPrompt =
    `You are Assistly AI, an AI employee planning a project.

PROJECT NAME:
${project.name}

PROJECT DESCRIPTION:
${project.description || "No description provided."}

PROJECT CONTEXT:
${project.context || "No additional context provided."}

Create a practical project plan specifically for this project.

Requirements:
- Create exactly 6 tasks.
- Make the tasks specific to the project.
- Put them in a logical order.
- Start with understanding/requirements.
- Include research or preparation when appropriate.
- Include creation/execution work.
- Include review/testing when appropriate.
- End with final improvements and delivery.
- Do not make the tasks generic unless the project genuinely requires them.

Return ONLY a numbered list like:

1. Task
2. Task
3. Task
4. Task
5. Task
6. Task`;

  const planningResponse =
    await ai.models.generateContent({
      model: GEMINI_MODEL,

      systemInstruction:
        "You are Assistly AI, an AI employee that creates practical project plans.",

      contents: planningPrompt,
    });

  const planningText =
    planningResponse.text || "";

  // ----------------------------------------------------------
  // Convert Gemini's numbered list into project tasks
  // ----------------------------------------------------------

  const planTasks = planningText
    .split("\n")
    .map((line) =>
      line
        .replace(
          /^\s*\d+[\).\:-]\s*/,
          ""
        )
        .trim()
    )
    .filter(Boolean)
    .slice(0, 6);

  if (planTasks.length === 0) {
    return res.status(500).json({
      reply:
        "I couldn't create a project plan right now. Please try again.",
    });
  }

  project.tasks =
    planTasks.map(
      (title, index) => ({
        id:
          Date.now() + index,

        title,

        completed: false,

        output: null,

        dueDate: null,

        createdAt:
          new Date().toISOString(),
      })
    );

  project.status = "active";

  saveProjects();

  const taskList =
    project.tasks
      .map(
        (task, index) =>
          `${index + 1}. ${task.title}`
      )
      .join("\n");

  return res.json({
    reply:
      `I've created a project-specific plan for "${project.name}".\n\n` +
      `Tasks:\n${taskList}`,

    project,
  });
}

    // ============================================================
// CREATE PROJECT
// ============================================================

if (
  lowerMessage.startsWith("create a project") ||
  lowerMessage.startsWith("create project") ||
  lowerMessage.startsWith("start a project") ||
  lowerMessage.startsWith("start project")
) {
  let projectText = message
    .replace(
      /^create a project(?:\s+called)?[:\s]*/i,
      ""
    )
    .replace(
      /^create project(?:\s+called)?[:\s]*/i,
      ""
    )
    .replace(
      /^start a project(?:\s+called)?[:\s]*/i,
      ""
    )
    .replace(
      /^start project(?:\s+called)?[:\s]*/i,
      ""
    )
    .replace(/[.!?]+$/, "")
    .trim();

  if (!projectText) {
    return res.json({
      reply:
        "What would you like to name the project?",
    });
  }

  // ----------------------------------------------------------
  // Extract project name and optional description
  // ----------------------------------------------------------

  let projectName = projectText;
  let description = "";

  const descriptionMatch =
    projectText.match(
      /^(.+?)\s+(?:to|for|about|that|which)\s+(.+)$/i
    );

  if (descriptionMatch) {
    projectName =
      descriptionMatch[1].trim();

    description =
      descriptionMatch[2].trim();
  }

  // Remove trailing punctuation
  projectName =
    projectName
      .replace(/[.!?]+$/, "")
      .trim();

  description =
    description
      .replace(/[.!?]+$/, "")
      .trim();

  // ----------------------------------------------------------
  // Check for duplicate project
  // ----------------------------------------------------------

  const existingProject =
    findProjectByName(
      projectName
    );

  if (existingProject) {
    return res.json({
      reply:
        `A project called "${projectName}" already exists.`,
      project:
        existingProject,
    });
  }

  // ----------------------------------------------------------
  // Create project
  // ----------------------------------------------------------

  const project = {
    id: Date.now(),

    name: projectName,

    description,

    context: "",

    status: "active",

    tasks: [],

    createdAt:
      new Date().toISOString(),
  };

  projects.push(project);

  saveProjects();

  // ----------------------------------------------------------
  // Response
  // ----------------------------------------------------------

  if (description) {
    return res.json({
      reply:
        `I've created the "${projectName}" project.\n\n` +
        `Project description: ${description}\n\n` +
        `You can now ask me to plan the project.`,

      project,
    });
  }

  pendingProjectDescription = {
  projectId: project.id,
};

return res.json({
  reply:
    `I've created the "${projectName}" project.\n\n` +
    `What is the project about? You can tell me the goal, what needs to be done, or any important requirements.`,

  project,
});
}

    // ========================================================
    // NORMAL AI CHAT
    // ========================================================

    conversationHistory.push({
      role: "user",
      parts: [
        {
          text: message,
        },
      ],
    });

    console.log(
      "MEMORY:",
      JSON.stringify(
        conversationHistory
      )
    );

    const response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,

        systemInstruction:
          "You are Assistly AI, an AI employee for businesses and remote workers. " +
          "You help users organize work, manage tasks and schedules, research information, " +
          "draft professional content, analyze information, plan projects, and solve problems. " +
          "Be helpful, concise, professional, and action-oriented. " +
          "When the user asks for something that requires an Assistly feature, use the available feature logic when possible. " +
          "Do not claim to have performed real-world actions you cannot actually perform.",

        contents:
          conversationHistory,
      });

    conversationHistory.push({
      role: "model",
      parts: [
        {
          text: response.text,
        },
      ],
    });

    return res.json({
      reply: response.text,
    });
  } catch (error) {
  console.error("Chat error:", error);

  // Gemini API quota/rate-limit error
  if (error?.status === 429) {
    return res.status(429).json({
      reply:
        "I've reached the current Gemini API usage limit. " +
        "Your Assistly project data is safe. Please try again after the API quota resets.",
      error: "GEMINI_QUOTA_EXCEEDED",
    });
  }

  // Other Gemini/API errors
  return res.status(500).json({
    reply: "Assistly ran into an AI service error. Please try again.",
    error: error?.message || "Unknown error",
  });
}
});

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Assistly AI backend running on port ${PORT}`
    );
  }
);