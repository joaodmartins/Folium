---
title: Operating Systems - Lesson 1
author: João Martins
description: What an operating system is and how processes are created.
language: en
showTableOfContents: true
---

# Operating Systems - Lesson 1

What an operating system is and how processes are created.

## What is an operating system?

An operating system (OS) manages the hardware of a computer and provides
services to the programs that run on it: process scheduling, memory
management, file systems and device access.

## Creating a process

On Unix-like systems a new process is created with the `fork()` system call.
The child is a copy of the parent, and each one receives a different return
value:

```c
#include <stdio.h>
#include <unistd.h>

int main(void) {
    pid_t pid = fork();

    if (pid == 0) {
        printf("Hello from the child process\n");
    } else {
        printf("Hello from the parent process\n");
    }
    return 0;
}
```

In the next lesson we will look at how processes are scheduled.
