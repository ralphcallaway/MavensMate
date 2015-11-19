/**
 * @file Represents a local MavensMate project
 * @author Joseph Ferraro <@joeferraro>
 */

'use strict';
var Promise           = require('bluebird');
var temp              = require('temp');
var _                 = require('lodash');
var fs                = require('fs-extra-promise');
var path              = require('path');
var find              = require('findit');
var util              = require('./util').instance;
var uuid              = require('node-uuid');
var inherits          = require('inherits');
var events            = require('events');
var SalesforceClient  = require('./sfdc-client');
var MetadataHelper    = require('./metadata').MetadataHelper;
var config            = require('./config');
var logger            = require('winston');
var normalize         = require('./utilities/normalize-object');
var IndexService      = require('./index');
var Package           = require('./package').Package;
var SymbolService     = require('./symbol');
var LogService        = require('./log');
var LightningService  = require('./lightning');
var KeychainService   = require('./keychain');

/**
 * Represents a MavensMate project
 *
 * @constructor
 * @param {Object} [opts] - Options used in deployment
 * @param {String} [opts.name] - For new projects, sets the name of the project
 * @param {String} [opts.subscription] - (optional) Specifies list of Metadata types that the project should subscribe to
 * @param {String} [opts.workspace] - (optional) For new projects, sets the workspace
 * @param {String} [opts.path] - (optional) Explicitly sets path of the project (defaults to current working directory)
 * @param {Array} [opts.packages] - List of packages
 */
var Project = function(opts) {
  util.applyProperties(this, opts);
  this.keychainService = new KeychainService();
};

inherits(Project, events.EventEmitter);

Project.prototype._path = null;
Project.prototype._workspace = null;
Project.prototype._session = null;

/**
 * File path of the project
 */
Object.defineProperty(Project.prototype, 'path', {
  get: function() {
    return this._path;
  },
  set: function(value) {
    this._path = value;
  }
});

/**
 * Workspace of the project
 */
Object.defineProperty(Project.prototype, 'workspace', {
  get: function() {
    return this._workspace;
  },
  set: function(value) {
    this._workspace = value;
  }
});

/**
 * Initializes project instance based on whether this is a new or existing project
 * @param  {Boolean} isNewProject
 * @return {Promise}
 */
Project.prototype.initialize = function(isNewProject, isExistingDirectory) {
  var self = this;

  return new Promise(function(resolve, reject) {
    isNewProject = isNewProject || false;

    if (!isNewProject) {
      self._initExisting()
        .then(function() {
          self.initialized = true;
          resolve(self);
        })
        .catch(function(error) {
          logger.error('Could not initiate existing Project instance: '+error.message);
          reject(error);
        })
        .done();
    } else if (isNewProject) {
      var initPromise = isExistingDirectory ? self._initNewProjectFromExistingDirectory() : self._initNew();
      initPromise
        .then(function() {
          self.initialized = true;
          resolve(self);
        })
        .catch(function(error) {
          logger.error('Could not initiate new Project instance: '+error.message);
          reject(error);
        })
        .done();
    }
  });
};

/**
 * Initiates an existing (on disk) MavensMate project instance
 * @return {Promise}
 */
Project.prototype._initNewProjectFromExistingDirectory = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    var pkg, fileProperties;
    if (!self.workspace) {
      throw new Error('Please select a workspace for this project');
    }
    if (!fs.existsSync(path.join(self.origin, 'src'))) {
      return reject(new Error('Project must have a top-level src directory'));
    }
    if (!fs.existsSync(path.join(self.origin, 'src', 'package.xml'))) {
      return reject(new Error('Project must have a valid package.xml file located in the src directory'));
    }

    if (self.origin !== path.join(self.workspace, self.name)) {
      if (fs.existsSync(path.join(self.workspace, self.name))) {
        return reject(new Error('Project with this name already exists in the selected workspace'));
      } else {
        // copy non-mavensmate project to selected workspace
        fs.ensureDirSync(path.join(self.workspace, self.name));
        fs.copySync(self.origin, path.join(self.workspace, self.name));
      }
    }
    self.path = path.join(self.workspace, self.name);
    fs.ensureDirSync(path.join(self.path, 'config'));

    self.sfdcClient.describe()
      .then(function(describe) {
        return self.setDescribe(describe);
      })
      .then(function() {
        pkg = new Package({ project: self, path: path.join(self.path, 'src', 'package.xml') });
        return pkg.init();
      })
      .then(function() {
        return self.sfdcClient.retrieveUnpackaged(pkg.subscription, true, self.path);
      })
      .then(function(retrieveResult) {
        logger.debug('retrieve result: ');
        logger.debug(retrieveResult);
        fileProperties = retrieveResult.fileProperties;
        if (fs.existsSync(path.join(self.path, 'unpackaged'))) {
          fs.removeSync(path.join(self.path, 'unpackaged'));
        }
        self.id = uuid.v1();
        return self._initConfig();
      })
      .then(function() {
        logger.debug('initing local store ... ');
        logger.debug(fileProperties);

        return self._writeLocalStore(fileProperties);
      })
      .then(function() {
        resolve();
      })
      .catch(function(error) {
        // remove directory from workspace if we encounter an exception along the way
        logger.error('Could not retrieve and write project to file system: '+error.message);
        logger.error(error.stack);
        if (self.origin !== path.join(self.workspace, self.name) && fs.existsSync(path.join(self.workspace, self.name))) {
          fs.removeSync(path.join(self.workspace, self.name));
        }
        reject(error);
      })
      .done();
  });
};

/**
 * Initiates an existing (on disk) MavensMate project instance
 * @return {Promise}
 */
Project.prototype._initExisting = function() {
  logger.debug('initing existing project ...');

  var self = this;

  return new Promise(function(resolve, reject) {
    if (!self._isValid()) {
      reject(new Error('This does not seem to be a valid MavensMate project directory.'));
    } else {
      if (self.path !== undefined) {
        self.workspace = path.dirname(self.path);
        self.name = path.basename(self.path);
      } else if (self.workspace !== undefined && self.name !== undefined) {
        self.path = path.join(self.workspace, self.name);
      } else {
        self.path = process.cwd();
        self.workspace = path.dirname(self.path);
        self.name = path.basename(self.path);
      }

      if (!fs.existsSync(self.path)) {
        return reject(new Error('This does not seem to be a valid MavensMate project directory.'));
      }

      logger.debug('project name', self.name);
      logger.debug('project path', self.path);
      // self.workspace = path.dirname(self.path);
      // self.name = path.basename(self.path);

      // TODO: Promise.all or reduce
      // first order of business is to ensure we have a valid sfdc-client

      self.packageXml = new Package({ project: self, path: path.join(self.path, 'src', 'package.xml') });
      self.packageXml.init()
        .then(function() {
          return self._getSettings();
        })
        .then(function() {
          return self._getCachedSession();
        })
        .then(function(cachedSession) {
          cachedSession.username = self.settings.username;
          cachedSession.password = self.settings.password;
          cachedSession.orgType = self.settings.environment;
          cachedSession.loginUrl = self.settings.loginUrl;
          if (!self.sfdcClient) {
            self.sfdcClient = new SalesforceClient(cachedSession);
            self.sfdcClient.on('sfdcclient-cache-refresh', function() {
              logger.debug('project caught event: sfdcclient-cache-refresh');
              self._writeSession()
                .then(self._getCachedSession())
                .catch(function(err) {
                  logger.debug('sfdcclient-cache-refresh: could not update local session cache');
                  throw new Error('Could not update local session cache: '+err.message);
                })
                .done();
            });
          }
          return self.sfdcClient.initialize();
        })
        .then(function() {
          return self._writeSession();
        })
        .then(function() {
          self.getLocalStore();
          return self.getOrgMetadataIndexWithSelections();
        })
        .then(function() {
          return self._refreshDescribeFromServer();
        })
        .then(function() {
          self.logService = new LogService(self);
          self.sfdcClient.on('sfdcclient-new-log', function(message) {
            if (message.sobject && message.sobject.Id) {
              self.logService.downloadLog(message.sobject.Id)
                .then(function(filePath) {
                  self.emit('new-log', filePath);
                })
                .catch(function(error) {
                  logger.debug('Could not download log: '+error.message);
                })
                .done();
            }
          });
          return self.sfdcClient.startSystemStreamingListener();
        })
        .then(function() {
          self.valid = true;
          resolve();
        })
        .catch(function(error) {
          if (error.message.indexOf('INVALID_LOGIN') >= 0 || error.message.indexOf('EXPIRED_PASSWORD') >= 0 || error.message.indexOf('LOGIN_MUST_USE_SECURITY_TOKEN') >= 0) {
            self.valid = false;
          }
          reject(error);
        })
        .done();
    }
  });
};

/**
 * Initiates a new (not yet on disk) MavensMate project instance
 * @return {Promise}
 */
Project.prototype._initNew = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    if (!self.workspace) {
      var workspace;
      var workspaceSetting = config.get('mm_workspace');
      logger.debug('Workspace not specified, retrieving base workspace: ');
      logger.debug(workspaceSetting);
      if (_.isArray(workspaceSetting)) {
        workspace = workspaceSetting[0];
      } else if (_.isString(workspaceSetting)) {
        workspace = workspaceSetting;
      }
      if (workspace && !fs.existsSync(workspace)) {
        fs.mkdirSync(workspace);
      }
      self.workspace = workspace;
      logger.debug('workspace set to: '+self.workspace);
    } else if (!fs.existsSync(self.workspace)) {
      fs.mkdirSync(self.workspace);
    }
    if (!self.workspace) {
      throw new Error('Could not set workspace for new project');
    }
    self.path = path.join(self.workspace, self.name);
    if (fs.existsSync(self.path)) {
      reject(new Error('Directory already exists!'));
    } else {
      self.id = uuid.v1();
      resolve(self.id);
    }
  });
};

Project.prototype.replaceLocalFiles = function(remotePath, replacePackageXml) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var finder = find(remotePath);
    finder.on('file', function (file) {
      var fileBasename = path.basename(file);
      // file => /foo/bar/myproject/unpackaged/classes/myclass.cls
      logger.debug('refreshing file: '+file);

      var directory = path.dirname(file); //=> /foo/bar/myproject/unpackaged/classes
      var destinationDirectory = directory.replace(remotePath, path.join(self.workspace, self.name, 'src')); //=> /foo/bar/myproject/src/classes

      // make directory if it doesnt exist (parent dirs included)
      if (!fs.existsSync(destinationDirectory)) {
        fs.mkdirpSync(destinationDirectory);
      }

      // remove project metadata, replace with recently retrieved
      if (replacePackageXml && fileBasename === 'package.xml') {
        fs.removeSync(path.join(destinationDirectory, fileBasename));
        fs.copySync(file, path.join(destinationDirectory, fileBasename));
      } else if (fileBasename !== 'package.xml') {
        fs.removeSync(path.join(destinationDirectory, fileBasename));
        fs.copySync(file, path.join(destinationDirectory, fileBasename));
      }
    });
    finder.on('end', function () {
      // remove retrieved
      // TODO: package support
      if (fs.existsSync(remotePath)) {
        fs.removeAsync(remotePath)
          .then(function() {
            resolve();
          })
          .catch(function(err) {
            reject(err);
          });
      } else {
        resolve();
      }
    });
    finder.on('error', function (err) {
      logger.debug('Could not process retrieved metadata: '+err.message);
      reject(err);
    });
  });
};

Project.prototype._isValid = function() {
  if (this.path !== undefined) {
    return fs.existsSync(path.join(this.path, 'config', '.settings'));
  } else if (this.workspace !== undefined && this.name !== undefined) {
    return fs.existsSync(path.join(this.workspace, this.name, 'config', '.settings'));
  } else {
    return fs.existsSync(path.join(process.cwd(),'config', '.settings'));
  }
};

/**
 * Performs a Salesforce.com retrieve based on the type of project being requested,
 * create necessary /config, places on the disk in the correct workspace
 * @return {Promise}
 */
Project.prototype.retrieveAndWriteToDisk = function() {
  var self = this;

  return new Promise(function(resolve, reject) {
    var fileProperties;
    if (fs.existsSync(self.path)) {
      reject(new Error('Project with this name already exists in the specified workspace.'));
    } else {
      if (!self.package) {
        // if user has not specified package, add standard developer objects to package
        self.package = [
          'ApexClass', 'ApexComponent', 'ApexPage', 'ApexTrigger', 'StaticResource'
        ];
      }
      self.sfdcClient.describe()
        .then(function(describe) {
          return self.setDescribe(describe);
        })
        .then(function() {
          self.path = path.join(self.workspace, self.name);
          fs.mkdirSync(self.path);
          fs.mkdirSync(path.join(self.path, 'config'));
          return self.sfdcClient.retrieveUnpackaged(self.package, true, self.path);
        })
        .then(function(retrieveResult) {
          fileProperties = retrieveResult.fileProperties;
          if (fs.existsSync(path.join(self.path, 'unpackaged'))) {
            fs.renameSync(path.join(self.path, 'unpackaged'), path.join(self.path, 'src'));
          }
          // TODO: ensure packages write properly
          return self._initConfig();
        })
        .then(function() {
          logger.debug('initing local store ... ');
          logger.debug(fileProperties);

          return self._writeLocalStore(fileProperties);
        })
        .then(function() {
          resolve();
        })
        .catch(function(error) {
          // remove directory from workspace if we encounter an exception along the way
          logger.error('Could not retrieve and write project to file system: '+error.message);
          logger.error(error.stack);
          if (fs.existsSync(self.path)) {
            fs.removeSync(self.path);
          }
          reject(error);
        })
        .done();
    }
  });
};

/**
 * Writes config/ files
 * @return {Promise}
 */
Project.prototype._initConfig = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    // todo: should we index apex here?
    var promises = [
      self._writeSettings(),
      self._writeSession(),
      self._writeDebug(),
      self._writeEditorSettings(),
      self._refreshDescribeFromServer(),
      self.indexLightning()
    ];

    Promise.all(promises)
      .then(function() {
        return self._storePassword();
      })
      .then(function() {
        resolve();
      })
      .catch(function(err) {
        logger.error('Could not initiate project config directory -->'+err.message);
        reject(err);
      })
      .done();
  });
};

/**
 * Reverts a project to server state based on package.xml
 * TODO: handle packages!
 * @return {Promise}
 */
Project.prototype.refreshFromServer = function() {
  // TODO: implement stash!
  var self = this;
  return new Promise(function(resolve, reject) {
    logger.debug('refreshing project from server...');
    var retrieveResult;
    var retrievePath = temp.mkdirSync({ prefix: 'mm_' });
    self.packageXml = new Package({ project: self, path: path.join(self.path, 'src', 'package.xml') });
    self.packageXml.init()
      .then(function() {
        return self.sfdcClient.retrieveUnpackaged(self.packageXml.subscription, true, retrievePath);
      })
      .then(function(res) {
        retrieveResult = res;
        util.emptyDirectoryRecursiveSync(path.join(self.path, 'src'));
        return self.replaceLocalFiles(path.join(retrievePath, 'unpackaged'), true);
      })
      .then(function() {
        return self._writeLocalStore(retrieveResult.fileProperties);
      })
      .then(function() {
        return self.indexLightning();
      })
      .then(function() {
        util.removeEmptyDirectoriesRecursiveSync(path.join(self.path, 'src'));
        resolve();
      })
      .catch(function(err) {
        logger.error('Error refreshing project from server -->'+err.message);
        reject(err);
      })
      .done();
  });
};

/**
 * Reverts a project to server state based on package.xml, also updates local metadata index and describe index
 * TODO: handle packages!
 * @return {Promise}
 */
Project.prototype.clean = function() {
  // TODO: implement stash!
  var self = this;
  return new Promise(function(resolve, reject) {
    self.refreshFromServer()
      .then(function() {
        return self._refreshDescribeFromServer();
      })
      .then(function() {
        return self.indexMetadata();
      })
      .then(function() {
        resolve();
      })
      .catch(function(err) {
        logger.error('Error cleaning project -->'+err.message);
        reject(err);
      })
      .done();
  });
};

/**
 * Compiles projects based on package.xml
 * @return {Promise}
 */
Project.prototype.compile = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    // writes temp directory, puts zip file inside
    var newPath = temp.mkdirSync({ prefix: 'mm_' });
    fs.copy(path.join(self.path, 'src'), path.join(newPath, 'unpackaged'), function(err) {
      if (err) {
        return reject(err);
      } else {
        var deployResult;
        util.zipDirectory(path.join(newPath, 'unpackaged'), newPath)
          .then(function() {
            var zipStream = fs.createReadStream(path.join(newPath, 'unpackaged.zip'));
            return self.sfdcClient.deploy(zipStream, { rollbackOnError : true, performRetrieve: true });
          })
          .then(function(result) {
            logger.debug('Compile result: ');
            logger.debug(result);
            deployResult = result;
            if (deployResult.details.retrieveResult) {
              return self.updateLocalStore(deployResult.details.retrieveResult.fileProperties);
            } else {
              return new Promise(function(resolve) {
                resolve();
              });
            }
          })
          .then(function() {
            resolve(deployResult);
          })
          .catch(function(error) {
            reject(error);
          })
          .done();
      }
    });
  });
};

/**
 * Edits project based on provided payload (should be a JSON package)
 * @param  {Object} payload
 * @return {Promise}
 */
Project.prototype.edit = function(pkg) {
  // TODO: implement stash!
  var self = this;
  return new Promise(function(resolve, reject) {
    var newPackage;
    logger.debug('editing project, requested package is: ', pkg);
    var retrievePath = temp.mkdirSync({ prefix: 'mm_' });
    self.sfdcClient.retrieveUnpackaged(pkg, true, retrievePath)
      .then(function(retrieveResult) {
        return self._writeLocalStore(retrieveResult.fileProperties);
      })
      .then(function() {
        util.emptyDirectoryRecursiveSync(path.join(self.path, 'src'));
        return self.replaceLocalFiles(path.join(retrievePath, 'unpackaged'), true);
      })
      .then(function() {
        newPackage = new Package({ project: self, path: path.join(self.path, 'src', 'package.xml') });
        return newPackage.init();
      })
      .then(function() {
        self.packageXml = newPackage;
        util.removeEmptyDirectoriesRecursiveSync(path.join(self.path, 'src'));
        resolve();
      })
      .catch(function(error) {
        reject(error);
      })
      .done();
  });
};

Project.prototype._getCachedSession = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    if (fs.existsSync(path.join(self.path, 'config', '.session'))) {
      fs.readJson(path.join(self.path, 'config', '.session'), function(err, cachedSession) {
        if (err) {
          if (err.message.indexOf('Unexpected end of input') >= 0) {
            resolve({});
          } else {
            reject(err);
          }
        } else {
          self.cachedSession = cachedSession;
          resolve(cachedSession);
        }
      });
    } else {
      resolve({});
    }
  });
};

Project.prototype.getSubscription = function() {
  return this.settings.subscription;
};

/**
 * Updates project subscriptions
 * @param {String} key - setting key you'd like to override
 * @param  {Array} newSubscription - array of types ['ApexClass', 'CustomObject']
 * @return {Promise}                 [description]
 */
Project.prototype.updateSetting = function(key, value) {
  var self = this;
  return new Promise(function(resolve, reject) {
    logger.debug('updating project setting ['+key+']');
    logger.debug(value);

    var settings;
    try {
      settings = fs.readJsonSync(path.join(self.path, 'config', '.settings'));
    } catch(err) {
      reject(new Error('Could not read project .settings file: '+err.message));
    }

    settings[key] = value;

    logger.debug('Updating project settings: ');
    logger.debug(settings);

    try {
      fs.writeFileSync(path.join(self.path, 'config', '.settings'), JSON.stringify(settings, null, 4));
      self.settings = settings;
      resolve();
    } catch(err) {
      logger.error('Could not write project .settings file -->'+err.message);
      reject(err);
    }
  });
};

Project.prototype.updateCreds = function(creds) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self.sfdcClient = new SalesforceClient({
      username: creds.username,
      password: creds.password,
      orgType: creds.orgType,
      loginUrl: creds.loginUrl
    });
    self.sfdcClient.initialize()
      .then(function() {
        return self._storePassword(creds.password, true);
      })
      .then(function() {
        return self.updateSetting('username', creds.username);
      })
      .then(function() {
        return self.updateSetting('environment', creds.orgType);
      })
      .then(function() {
        return self.updateSetting('loginUrl', creds.loginUrl);
      })
      .then(function() {
        return self.updateDebug('users', [self.sfdcClient.getUserId()])
      })
      .then(function() {
        if (!self.valid) {
          return self._initExisting();
        } else {
          return new Promise(function(res) { res(); });
        }
      })
      .then(function() {
        self.sfdcClient.on('sfdcclient-cache-refresh', function() {
          self._writeSession()
            .then(self._getCachedSession())
            .catch(function(err) {
              throw new Error('Could not update local session cache: '+err);
            })
            .done();
          return self._writeSession();
        });
        return self._writeSession();
      })
      .then(function() {
        return self._getCachedSession();
      })
      .then(function() {
        resolve();
      })
      .catch(function(err) {
        logger.error('Could not update credentials -->'+err.message);
        reject(err);
      })
      .done();
  });
};

// retrieves settings from config/.settings
Project.prototype._getSettings = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    fs.readJson(path.join(self.path, 'config', '.settings'), function(err, settings) {
      if (err) {
        reject(err);
      } else {
        self.settings = settings;
        self._getPassword()
          .then(function(pw) {
            self.settings.password = pw;
            resolve(self.settings);
          })
          .catch(function(err) {
            logger.error('Could not get project settings -->'+err.message);
            reject(err);
          })
          .done();
      }
    });
  });
};

// retrieves local_store from config/.local_store
Project.prototype.getLocalStore = function() {
  var localStore;
  try {
    localStore = fs.readJsonSync(path.join(this.path, 'config', '.local_store'));
  } catch(e) {
    if (e.message.indexOf('Unexpected end of input') >= 0) {
      localStore = {};
    } else {
      throw e;
    }
  }
  return localStore;
};

Project.prototype.getDebugSettingsSync = function() {
  var debugSettings;
  try {
    debugSettings = fs.readJsonSync(path.join(this.path, 'config', '.debug'));
  } catch(e) {
    if (e.message.indexOf('Unexpected end of input') >= 0) {
      debugSettings = {};
    } else {
      throw e;
    }
  }
  return debugSettings;
};

Project.prototype.setLightningIndex = function(index) {
  var self = this;
  return new Promise(function(resolve, reject) {
    try {
      fs.outputFileSync(path.join(self.path, 'config', '.lightning'), JSON.stringify(index, null, 4));
      self.lightningIndex = index;
      resolve();
    } catch(err) {
      logger.error('Could not write lightning index file -->'+err.message);
      reject(err);
    }
  });
};

Project.prototype.getLightningIndexSync = function() {
  var lightningIndex;
  try {
    lightningIndex = fs.readJsonSync(path.join(this.path, 'config', '.lightning'));
  } catch(e) {
    if (e.message.indexOf('Unexpected end of input') >= 0) {
      lightningIndex = [];
    } else {
      throw e;
    }
  }
  return lightningIndex;
};

Project.prototype.getLightningIndex = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    try {
      var lightningIndex = fs.readJsonSync(path.join(self.path, 'config', '.lightning'));
      return resolve(lightningIndex);
    } catch(err) {
      logger.debug('could not get index the first time');
      logger.debug(err);
      // if err is empty/missing file, index it
      self.indexLightning()
        .then(function() {
          logger.debug('done indexing lightning, now go get it');
          var lightningIndex = fs.readJsonSync(path.join(self.path, 'config', '.lightning'));
          return resolve(lightningIndex);
        })
        .catch(function(err) {
          logger.error('Could not get lightning index -->'+err.message);
          reject(err);
        });
    }
  });
};

// retrieves describe from config/.describe
Project.prototype.getDescribe = function() {
  return this._describe;
};

Project.prototype.setDescribe = function(describe) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var describePath = path.join(self.path, 'config', '.describe');
    if (fs.existsSync(path.join(self.path, 'config'))) {
      fs.outputFile(describePath, JSON.stringify(describe, null, 4), function(err) {
        if (err) {
          return reject(err);
        } else {
          self._describe = describe;
          resolve();
        }
      });
    } else {
      self._describe = describe;
      resolve();
    }
  });
};

// writes config/.settings
Project.prototype._refreshDescribeFromServer = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    self.sfdcClient.describe()
      .then(function(res) {
        return self.setDescribe(res);
      })
      .then(function() {
        resolve();
      })
      .catch(function(error) {
        reject(error);
      })
      .done();
  });
};

Project.prototype.indexLightning = function() {
  var self = this;
  logger.debug('indexing lightning to config/.lightning');
  return new Promise(function(resolve, reject) {
    var lightningService = new LightningService(self);
    lightningService.getAll()
      .then(function(res) {
        return self.setLightningIndex(res);
      })
      .then(function() {
        return resolve();
      })
      .catch(function(err) {
        if (err.message.indexOf('sObject type \'AuraDefinition\' is not supported') >= 0 || err.message.indexOf('requested resource does not exist') >= 0) {
          resolve();
        } else {
          logger.error('Could not index lightning -->'+err.message);
          reject(err);
        }
      })
      .done();
  });
};

/**
 * Indexes Apex symbols
 * @return {Promise}
 */
Project.prototype.indexSymbols = function(apexClassName) {
  var self = this;
  return new Promise(function(resolve, reject) {
    if (!fs.existsSync(path.join(self.path, 'config', '.symbols'))) {
      fs.mkdirpSync(path.join(self.path, 'config', '.symbols'));
    }

    // todo: stash existing
    var symbolService = new SymbolService(self);

    var symbolPromise = apexClassName ? symbolService.indexApexClass(apexClassName) : symbolService.index();
    symbolPromise
      .then(function() {
        logger.debug('done indexing symbols!');
        resolve();
      })
      .catch(function(err) {
        logger.error('Could not index apex symbols: '+err.message);
        reject(err);
      })
      .done();
  });
};

/**
 * Populates project's config/.org_metadata with server metadata based on the projects subscription
 * @return {Promise}
 */
Project.prototype.indexMetadata = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    // todo: stash existing
    var indexService = new IndexService({ project: self });
    indexService.indexServerProperties(self.getSubscription())
      .then(function(res) {
        fs.outputFile(path.join(self.path, 'config', '.org_metadata'), JSON.stringify(res, null, 4), function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      })
      .catch(function(err) {
        logger.error('Could not index metadataHelper: '+err.message);
        reject(err);
      })
      .done();
  });
};

Project.prototype.getOrgMetadataIndex = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    fs.readJson(path.join(self.path, 'config', '.org_metadata'), function(err, orgMetadata) {
      if (err) {
        logger.debug('Could not return org metadata: '+err.message);
        resolve([]);
      } else {
        resolve(orgMetadata);
      }
    });
  });
};

Project.prototype.getOrgMetadataIndexWithSelections = function(keyword, ids, packageLocation) {
  var self = this;
  return new Promise(function(resolve, reject) {
    if (fs.existsSync(path.join(self.path, 'config', '.org_metadata'))) {
      try {
        fs.readJson(path.join(self.path, 'config', '.org_metadata'), function(err, orgMetadata) {
          if (err) {
            reject(err);
          } else {
            self.orgMetadata = orgMetadata;
            var indexService = new IndexService({ project: self });
            var metadataHelper = new MetadataHelper({ sfdcClient: self.sfdcClient });

            var promise;
            var customPackage;
            if (packageLocation) {
              customPackage = new Package({ path: packageLocation });
              promise = customPackage.init();
            } else {
              promise = new Promise(function(r) { r(); });
            }

            promise
              .then(function() {
                if (!ids) {
                  ids = [];
                  var pkg = packageLocation ? customPackage : self.packageXml;
                  _.forOwn(pkg.subscription, function(packageMembers, metadataTypeXmlName) {
                    var metadataType = metadataHelper.getTypeByXmlName(metadataTypeXmlName); //inFolder, childXmlNames
                    if (!metadataType) {
                      return reject(new Error('Unrecognized package.xml metadata type: '+metadataTypeXmlName));
                    }
                    if (_.has(metadataType, 'parentXmlName')) {
                      var parentMetadataType = metadataHelper.getTypeByXmlName(metadataType.parentXmlName);
                    }
                    if (packageMembers === '*') {
                      ids.push(metadataTypeXmlName);
                      var indexedType = _.find(orgMetadata, { 'xmlName': metadataTypeXmlName });
                      if (_.has(indexedType, 'children')) {
                        _.each(indexedType.children, function(child) {
                          child.select = true;
                        });
                      }
                    } else {
                      _.each(packageMembers, function(member) {
                        if (metadataType.inFolder) {
                          // id : Document.FolderName.FileName.txt
                          ids.push([metadataTypeXmlName, member.replace(/\//, '.')].join('.'));
                        } else if (parentMetadataType) {
                          // id : CustomObject.Object_Name__c.fields.Field_Name__c
                          var id = [ parentMetadataType.xmlName, member.split('.')[0], metadataType.tagName, member.split('.')[1] ].join('.');
                          ids.push(id);
                        } else if (_.has(metadataType, 'childXmlNames')) {
                          var indexedType = _.find(orgMetadata, { 'xmlName': metadataTypeXmlName });
                          if (indexedType) {
                            var indexedNode = _.find(indexedType.children, { 'id': [metadataTypeXmlName, member].join('.')});
                            if (_.has(indexedNode, 'children')) {
                              _.each(indexedNode.children, function(child) {
                                child.select = true;
                                if (_.has(child, 'children')) {
                                  _.each(child.children, function(grandChild) {
                                    grandChild.select = true;
                                  });
                                }
                              });
                            }
                            ids.push([metadataTypeXmlName, member].join('.'));
                          }
                        } else {
                          // id: ApexClass.MyClassName
                          ids.push([metadataTypeXmlName, member].join('.'));
                        }
                      });
                    }
                  });
                }
                indexService.setChecked(orgMetadata, ids);
                indexService.ensureParentsAreCheckedIfNecessary(orgMetadata);
                if (keyword) {
                  indexService.setVisibility(orgMetadata, keyword);
                }
                resolve(orgMetadata);
              });
          }
        });
      } catch(err) {
        logger.debug('Could not getOrgMetadataIndexWithSelections: '+err.message);
        resolve([]);
      }
    } else {
      logger.debug('org_metadata not found, returning empty array');
      resolve([]);
    }
  });
};

Project.prototype.hasIndexedMetadata = function() {
  return _.isArray(this.orgMetadata) && this.orgMetadata.length > 0;
};

Project.prototype.updateLocalStore = function(fileProperties) {
  var self = this;
  return new Promise(function(resolve, reject) {
    if (!self.metadataHelper) {
      self.metadataHelper = new MetadataHelper({ sfdcClient: self.sfdcClient });
    }

    Promise.resolve(fileProperties).then(function (properties) {
      if (!_.isArray(properties)) {
        properties = [properties];
      }
      try {
        var store = self.getLocalStore();
        _.each(properties, function(fp) {
          if (fp.attributes) {
            fp = normalize(fp);
          }
          var metadataType;
          if (fp.type) {
            metadataType = self.metadataHelper.getTypeByXmlName(fp.type);
          } else if (fp.attributes && fp.attributes.type) {
            metadataType = self.metadataHelper.getTypeByXmlName(fp.attributes.type);
            fp.fullName = fp.name;
            fp.fileName = ['unpackaged', metadataType.directoryName, fp.name +'.'+metadataType.suffix].join('/');
            fp.createdByName = fp.createdBy.name;
            fp.lastModifiedByName = fp.lastModifiedBy.name;
            fp.manageableState = !fp.namespacePrefix ? 'unmanaged' : 'managed';
            fp.namespacePrefix = fp.namespacePrefix;
            fp.type = metadataType.xmlName;
            delete fp.createdBy;
            delete fp.lastModifiedBy;
            delete fp.attributes;
          } else {
            metadataType = self.metadataHelper.getTypeByPath(fp.fileName.split('.')[1]);
          }
          logger.debug(metadataType);
          if (metadataType && fp.attributes) {
            var key = fp.name+'.'+metadataType.suffix;
            var value = fp;
            value.mmState = 'clean';
            store[key] = value;
          } else if (metadataType && fp.fullName.indexOf('package.xml') === -1) {
            var key = fp.fullName+'.'+metadataType.suffix;
            var value = fp;
            value.mmState = 'clean';
            store[key] = value;
          } else {
            if (fp.fullName.indexOf('package.xml') === -1) {
              logger.debug('Could not determine metadata type for: '+JSON.stringify(fp));
            }
          }
        });

        var filePath = path.join(self.path, 'config', '.local_store');
        fs.outputFile(filePath, JSON.stringify(store, null, 4), function(err) {
          if (err) {
            logger.error('Could not write local store: '+err.message);
            reject(err);
          } else {
            resolve();
          }
        });
      } catch(err) {
        logger.error('Could not update local store -->'+err.message);
        reject(err);
      }
    });
  });
};

Project.prototype._writeLocalStore = function(fileProperties) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self.metadataHelper = new MetadataHelper({ sfdcClient: self.sfdcClient });
    logger.debug('writing to local store');
    Promise.resolve(fileProperties)
      .then(function (properties) {
        logger.debug('writing ...');
        try {
          if (!_.isArray(properties)) {
            properties = [properties];
          }
          logger.debug('writing local store -->');
          logger.debug(properties);
          var store = {};
          _.each(properties, function(fp) {
            // logger.debug('fileProperty:');
            // logger.debug(fp);
            var metadataType = self.metadataHelper.getTypeByPath(fp.fileName);
            logger.debug(metadataType);
            if (metadataType !== undefined && fp.fullName.indexOf('package.xml') === -1) {
              var key = fp.fullName+'.'+metadataType.suffix;
              var value = fp;
              value.mmState = 'clean';
              store[key] = value;
            } else {
              if (fp.fullName.indexOf('package.xml') === -1) {
                logger.debug('Could not determine metadata type for: '+JSON.stringify(fp));
              }
            }
          });
          var filePath = path.join(self.path, 'config', '.local_store');
          fs.outputFile(filePath, JSON.stringify(store, null, 4), function(err) {
            if (err) {
              reject(new Error('Could not write local store: '+err.message));
            } else {
              resolve();
            }
          });
        } catch(err) {
          logger.error('Could not initiate local store-->'+err.message);
          reject(err);
        }
      })
      .catch(function(err) {
        logger.error('fileproperties promise rejected: '+err.message);
        reject(err);
      });
  });
};

// write cached session
Project.prototype._writeSession = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    var filePath = path.join(self.path, 'config', '.session');

    var session = {
      accessToken: self.sfdcClient.getAccessToken(),
      instanceUrl: self.sfdcClient.conn.instanceUrl
    };

    logger.debug('writing local session');
    logger.silly(session);

    fs.outputFile(filePath, JSON.stringify(session, null, 4), function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// writes config/.settings
Project.prototype._writeSettings = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    var settings = {
      projectName: self.name,
      username: self.sfdcClient.getUsername(),
      id: self.id,
      namespace: self.sfdcClient.getNamespace() || '',
      environment: self.sfdcClient.getOrgType(),
      loginUrl: self.sfdcClient.getLoginUrl(),
      workspace: self.workspace,
      subscription: self.subscription || config.get('mm_default_subscription')
    };
    if (!self.keychainService.useSystemKeychain()) {
      settings.password = self.password;
    }
    var filePath = path.join(self.path, 'config', '.settings');
    fs.outputFile(filePath, JSON.stringify(settings, null, 4), function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

/**
 * Updates project debug settings
 * @param {String} key - setting key you'd like to override
 * @param  {Object} value - value to override
 * @return {Promise}                 [description]
 */
Project.prototype.updateDebug = function(key, value) {
  var self = this;
  return new Promise(function(resolve, reject) {
    logger.debug('updating debug setting ['+key+']');
    logger.debug(value);

    var debug;
    try {
      debug = fs.readJsonSync(path.join(self.path, 'config', '.debug'));
    } catch(err) {
      reject(new Error('Could not read project .debug file: '+err.message));
    }

    debug[key] = value;

    logger.debug('Updating project debug: ');
    logger.debug(debug);

    try {
      fs.writeFileSync(path.join(self.path, 'config', '.debug'), JSON.stringify(debug, null, 4));
      resolve();
    } catch(err) {
      logger.error('Could not write project .debug file -->'+err.message);
      reject(err);
    }
  });
};

// writes config/.debug
Project.prototype._writeDebug = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    var debug = {
      users: [self.sfdcClient.conn.userInfo.user_id],
      levels: {
          Workflow: 'INFO',
          Callout: 'INFO',
          System: 'DEBUG',
          Database: 'INFO',
          ApexCode: 'DEBUG',
          ApexProfiling: 'INFO',
          Validation: 'INFO',
          Visualforce: 'DEBUG'
      },
      expiration: 480
    };

    var filePath = path.join(self.path, 'config', '.debug');
    fs.outputFile(filePath, JSON.stringify(debug, null, 4), function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

Project.prototype._writeEditorSettings = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    // TODO: right now these are written to every project root, regardless of editor

    /*jshint camelcase: false */
    var sublimeSettings = {
      folders : [
        {
          "folder_exclude_patterns": [
              "config/.symbols"
          ],
          path : '.'
        }
      ],
      settings : {
        auto_complete_triggers : [
          {
              characters: '.',
              selector: 'source - comment'
          },
          {
              characters: ':',
              selector: 'text.html - comment'
          },
          {
              characters: '<',
              selector: 'text.html - comment'
          },
          {
              characters: ' ',
              selector: 'text.html - comment'
          }
        ]
      }
    };
    /*jshint camelcase: true */
    var filePath = path.join( self.path, [ self.name, 'sublime-project' ].join('.') );
    fs.outputFile(filePath, JSON.stringify(sublimeSettings, null, 4), function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });

  });
};

Project.prototype._storePassword = function(pw, replace) {
  var self = this;
  return new Promise(function(resolve, reject) {
    try {
      logger.silly('storing password');
        if (self.keychainService.useSystemKeychain()) {
          logger.silly('storing password in system keychain');
          if (replace) {
            self.keychainService.replacePassword(self.id || self.settings.id, pw || self.password);
          } else {
            self.keychainService.storePassword(self.id || self.settings.id, pw || self.password);
          }
          // clear out any passwords that were previously stored in .settings
          self.updateSetting('password', undefined)
            .then(function() {
              resolve();
            })
            .catch(function(err) {
              logger.error('Could not clear password setting -->'+err.message);
              reject(err);
            })
            .done();
        } else {
          logger.silly('storing password in .settings');
          self.updateSetting('password', pw || self.password)
            .then(function() {
              resolve();
            })
            .catch(function(err) {
              logger.error('Could not update password setting -->'+err.message);
              reject(err);
            })
            .done();
        }
    } catch(err) {
      logger.error('Could not store password -->'+err.message);
      reject(err);
    }
  });
};

Project.prototype._getPassword = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    try {
      // if the password is specified in config/.settings, it overrides their desire/ability to use keychain
      if (self.settings.password) {
        resolve(self.settings.password);
      } else {
        if (self.keychainService.useSystemKeychain()) {
          try {
            resolve(self.keychainService.getPassword(self.settings.id));
          } catch(e) {
            logger.error(e);
            reject(new Error('Could not retrieve project password from the system keychain. If you do not wish to use the system keychain, set "mm_use_keyring" to false, then specify the org password in your project\'s config/.settings file.'));
          }
        } else {
          reject(new Error('System keychain is not enabled/supported and there is no "password" property in project config/.settings file. Please add a "password" property to your project config/.settings file and try your operation.'));
        }
      }
    } catch(err) {
      logger.error('Could not retrieve password -->'+err.message);
      reject(err);
    }
  });
};

module.exports = Project;
