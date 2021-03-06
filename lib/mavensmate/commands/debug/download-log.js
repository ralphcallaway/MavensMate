/**
 * @file Downloads a debug log by id
 * @author Joseph Ferraro <@joeferraro>
 */

'use strict';

var Promise     = require('bluebird');
var inherits    = require('inherits');
var BaseCommand = require('../../command');
var LogService  = require('../../log');

function Command() {
  Command.super_.call(this, Array.prototype.slice.call(arguments, 0));
}

inherits(Command, BaseCommand);

Command.prototype.execute = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    var project = self.getProject();
    var logService = new LogService(project);
    logService.downloadLog(self.payload.logId)
      .then(function(result) {
        resolve(result);
      })
      .catch(function(error) {
        reject(error);
      })
      .done();
  });
};

exports.command = Command;
exports.addSubCommand = function(client) {
  client.program
    .command('download-log [logId]')
    .description('Downloads a log to your project\'s debug/logs directory')
    .action(function(logId){
      client.executeCommand(this._name, { logId: logId }); 
    });
};