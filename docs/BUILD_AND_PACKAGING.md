# Building and Packaging the Application

This document provides instructions on how to build the application from source and create a distributable installer.

## Prerequisites

- Node.js (v22.x.x or later)
- npm (v10.x.x or later)

## Building the Application

To build the application and create a distributable installer, follow these steps:

1. **Install Dependencies:**
   Open your terminal or command prompt, navigate to the project's root directory, and run the following command to install the required dependencies:
   ```bash
   npm install
   ```

2. **Run the Build Script:**
   Once the dependencies are installed, run the following command to build the application and package it into an installer:
   ```bash
   npm run dist
   ```

## Output Files

After the build process is complete, you will find the generated installer in the `release/` directory at the root of the project.

The installer will be a `.exe` file for Windows.
