# [MavensMate](http://mavensmate.com) - Open Source IDEs for Salesforce

MavensMate is a powerful tool for building Salesforce IDEs. Develop Salesforce applications in your favorite text editors, like Sublime Text and Atom. MavensMate is created and maintained by [Joe Ferraro](http://twitter.com/joeferraro) with help from these [contributors](#contributors).

For more information, check out [http://mavensmate.com](http://mavensmate.com)!

- [MavensMate-app](#mavensmate-app)
- [MavensMate API](#mavensmate-api)
- [MavensMate Plugins](#active-plugins)
- [Bugs and Feature Requests](#bugs-and-feature-requests)
- [Documentation](#documentation)

[![Circle CI](https://circleci.com/gh/joeferraro/MavensMate.png?style=shield)](https://circleci.com/gh/joeferraro/MavensMate)

[![NPM Version](https://img.shields.io/npm/v/mavensmate.svg)](https://www.npmjs.org/package/mavensmate)
[![Coverage Status](https://coveralls.io/repos/joeferraro/MavensMate/badge.svg?branch=master)](https://coveralls.io/r/joeferraro/MavensMate?branch=master)

[![License](https://img.shields.io/npm/l/mavensmate.svg)](https://www.npmjs.org/package/mavensmate)

## MavensMate-app

MavensMate-app is an application that bundles the local MavensMate server and UIs into a desktop app that powers the MavensMate Sublime Text and Atom plugins. For more information and to download MavensMate-app, [visit the GitHub project](https://github.com/joeferraro/MavensMate-app).

<img width="1100" alt="9_27_15__11_46_pm" src="https://cloud.githubusercontent.com/assets/54157/10146854/e8e3695c-65f8-11e5-8a41-d1b3f77b7a14.png">

## MavensMate API

You can build your own Salesforce IDEs by integrating with the APIs exposed in this project. For Node.js projects, you can simply `require('mavensmate')`. For other types of projects, you may use the command line interface (see below, full documentation forthcoming).

### Install

`npm install mavensmate -g`

### Usage

#### Node Application

```
var mavensmate = require('mavensmate');
var client = mavensmate.createClient({
	name: 'my-mavensmate-client'
});
client.addProject('path/to/some/project')
  .then(function(res) {
    return client.executeCommand('compile-project');
  })
  .then(function(res) {
    console.log('command result', res);
  });
});
```

#### Command Line

`mavensmate <command>`

##### Examples

```

mavensmate new-project <<< '{ "name" : "myproject", "workspace" : "/path/to/workspace", "username" : "foo@bar.com", "password" : "foo", package: { "ApexClass" : "*" } }'

cd path/to/workspace/myproject

mavensmate edit-project <<< '{ "package" : { "ApexClass": [ "MyTestClass", "MyTestClass2" ], "ApexPage": "*" } }'

mavensmate update-creds foo@bar.com myPassword123!

mavensmate clean-project

mavensmate compile-project

mavensmate compile-metadata path/to/MyTestClass.cls

mavensmate delete-metadata path/to/MyPage.page

mavensmate start-logging

mavensmate run-tests path/to/MyTestClass.cls

mavensmate run-tests <<< '{ "paths" : [ "/path/to/MyTestClass.cls", "/path/to/MyTestClass2.cls" ] }'

mavensmate get-coverage path/to/MyTestClass.cls

mavensmate get-coverage --global

mavensmate stop-logging

mavensmate new-resource-bundle path/to/my/static/resource

mavensmate deploy-resource-bundle path/to/my/resource/bundle

mavensmate new-connection anotherOrg@somewhere.com coolPassword!

mavensmate deploy --ui

```

For a full list of commands, see the `lib/mavensmate/commands` directory. We will continue to build out this documentation with a full list of commands, including payload parameters.

#### Run Functional/Unit Tests

You must set the following environment variables before running tests:

`SALESFORCE_USERNAME`

`SALESFORCE_PASSWORD`

For verbose logging while running tests, set `MAVENSMATE_DEBUG_TESTS` to `true`

To run all unit and functional tests:

`npm test`

To run a specific test you may use the mocha command line interface from the project directory. Examples:

`mocha ./test/ --recursive --grep clean-project`

`mocha ./test/ --recursive -R spec --grep 'index-metadata|project-unit'`

To generate a coverage report, which will be located at test/coverage.html:

`make coverage`

## Active Plugins

### [MavensMate for Sublime Text][stp]

Build Salesforce applications from [Sublime Text 3](http://www.sublimetext.com/3)

### [MavensMate for Atom (beta)][atom]

Build Salesforce applications from [GitHub's Atom text editor](http://atom.io).

### [MavensMate for Visual Studio Code (coming soon)][vscode]

MavensMate is working with Microsoft to create an official plugin for Visual Studio Code!

## Bugs and feature requests

Have a bug or a feature request? If it's specific to the MavensMate core, [please open a new issue](https://github.com/joeferraro/mavensmate/issues). Before opening any issue, please search for existing issues.

If you have an issue with the Sublime Text or Atom plugin specifically, please open an issue at the proper project.

**Always include your MavensMate version number, platform, and specific steps to reproduce.**

## Contributors

- [Joseph Ferraro] (http://github.com/joeferraro)
- [Ralph Callaway] (http://github.com/ralphcallaway)
- [Kyle Thornton] (http://github.com/kylethornton)
- [David Helmer] (http://github.com/kidtsunami)
- [Justin Silver] (http://github.com/doublesharp)

## Documentation

MavensMate's documentation is built with [Daux.io](http://daux.io) and publicly available on [http://mavensmate.com][docs].

<img src="http://cdn.mavensconsulting.com/mavensmate/img/mm-bg.jpg"/>

[mmcom]: http://mavensmate.com/?utm_source=github&utm_medium=mavensmate&utm_campaign=api
[docs]: http://mavensmate.com/Getting_Started/Developers
[stp]: https://github.com/joeferraro/MavensMate-SublimeText
[atom]: https://github.com/joeferraro/MavensMate-Atom
[vscode]: https://github.com/joeferraro/MavensMate-VisualStudioCode

## Development
To setup a development version of the mavensmate core
1. Clone this repo down locally
2. Install node dependencies `npm update`
3. Run the server `/bin/server --verbose`
4. Update the `mm_app_server_port` attribute in your editors mavensmate configuration to the one listed when starting the server