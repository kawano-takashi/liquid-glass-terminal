# Security policy

## Supported versions

Security fixes are provided for the latest preview release on a best-effort basis. v0.1.x is pre-stable and may contain breaking changes.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** / private vulnerability reporting flow for this repository. Do not open a public issue containing exploit details, secrets, or personally identifiable information.

Include the affected version and OS, a minimal reproduction, impact, and any suggested mitigation. Maintainers will acknowledge a report when received and coordinate disclosure after a fix is available.

## Trust boundary

The renderer cannot choose arbitrary executables; it requests detected profile IDs from the main process. The selected shell and all of its child processes run with the same operating-system privileges as Liquid Glass Terminal. This application is a terminal, not a sandbox for commands entered by the user.

The application loads no remote UI, sends no telemetry, and denies runtime network requests. Explicit Ctrl/Cmd+click on validated HTTP(S) links delegates the URL to the operating system's default browser.

## Dependency audit scope

`npm audit --omit=dev` must report no known production vulnerabilities before release. The full development-tree audit may contain upstream advisories in Electron Forge packaging tools that process only repository-controlled assets. These are reviewed separately and are not shipped in `app.asar`; forced major-version overrides are not accepted without exercising every affected platform maker.
