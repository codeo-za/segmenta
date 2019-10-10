module.exports = function setTaskName(task, name) {
    task.displayName = name;
    Object.defineProperty(task, "name", {
        get() {
            return name;
        }
    });
    return task;
};
