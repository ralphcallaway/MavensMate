# Contributing to MavensMate

The following is a set of guidelines for contributing to MavensMate and its related projects,
which are hosted on the [GitHub](https://github.com/search?q=user%3Ajoeferraro+mavensmate).

This project adheres to the [Contributor Covenant 1.2](http://contributor-covenant.org/version/1/2/0).
By participating, you are expected to uphold this code. Please report unacceptable behavior to [info@mavensmate.com](mailto:info@mavensmate.com).

## Submitting Issues

Before submitting an issue to this project, you must be sure that the issue is specific to the MavensMate **core**, in other words, it's not a text editor specific issue. Please also **search first** before submitting a new issue.

When submitting a new issue, you must specify the following:

1. Your platform (OSX, Linux, Windows) and architecture (32 or 64 bit)
2. The MavensMate version(s), i.e. MavensMate plugin version and MavensMate-app version
3. Whether you are behind a firewall and/or proxy
4. **Specific** steps to reproduce
6. If relevant, your Salesforce server (e.g., cs18, c31, na7, etc.)
5. MavensMate and editor logs and any console output (see details below). 

If any of the above are missing, we will be unable to properly diagnose your issue.

### Logs

#### Mavensmate Core
Configure logging via MavensMate-app settings, run your failing operation to generate logs, and paste relevant logs to your issue. Note older plugin version do not use the stand-alone mavensmate, see [Enable Plugin Logging](https://mavensmate.com/Plugins/Sublime_Text/Plugin_Logging) for instructions on setting up logs.

#### Console Output
Most editor plugins will have some basic console output from mavensmate when running a command which should be included in your support request. There is also typically a low level editor log which can include additonal details. For Sublime Text go the view->show console to see the python console output and include in your issue. 

# Contributing

This project contains the Node.js source code that powers Salesforce IDEs for text editors like Atom and Sublime Text. 

## Submitting Pull Requests

To develop a new feature or fix a bug, please fork this project, do your development locally, then submit a Pull Request with corresponding test(s) (unit and functional, if applicable).
