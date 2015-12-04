'use strict';

var helper          = require('../../test-helper');
var chai            = require('chai');
var should          = chai.should();
var path            = require('path');
var fs              = require('fs-extra');
var assert          = chai.assert;
var mavensMateFile  = require('../../../lib/mavensmate/file');

chai.use(require('chai-fs'));

describe('mavensmate refresh-metadata', function(){

  var project;
  var testClient;

  before(function(done) {
    this.timeout(18000);
    testClient = helper.createClient('unittest');
    helper.unlinkEditor();
    helper.putTestProjectInTestWorkspace(testClient, 'refresh-metadata');
    helper.addProject(testClient, 'refresh-metadata')
      .then(function(proj) {
        project = proj;
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  after(function(done) {
    this.timeout(20000);
    helper.cleanUpTestProject('refresh-metadata');
    done();
  });

  it('should refresh class directory from the server', function(done) {
    this.timeout(20000);

    helper.createNewMetadata(testClient, 'ApexClass', 'RefreshMetadataClass')
      .then(function() {
        assert.isFile(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass.cls'));
        fs.removeSync(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass.cls'));

        var payload = {
          paths: [ path.join(testClient.getProject().path, 'src', 'classes') ]
        };

        return testClient.executeCommand('refresh-metadata', payload);
      })
      .then(function(response) {

        response.message.should.equal('Metadata successfully refreshed');
        fs.existsSync(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass.cls')).should.equal(true);
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  it('should refresh class file from the server', function(done) {
    this.timeout(20000);

    helper.createNewMetadata(testClient, 'ApexClass', 'RefreshMetadataClass2')
      .then(function() {
        assert.isFile(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass2.cls'));
        fs.removeSync(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass2.cls'));
        var payload = {
          paths: [ path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass2.cls') ]
        };
        return testClient.executeCommand('refresh-metadata', payload);
      })
      .then(function(response) {

        response.message.should.equal('Metadata successfully refreshed');
        path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass2.cls').should.be.a.file('RefreshMetadataClass2 is missing');
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  it('should refresh a CustomObject from the server ', function(done) {
    this.timeout(20000);

    var accountMetadataFile = new mavensMateFile.MavensMateFile({ project: testClient.getProject() });
    accountMetadataFile.setTypeByXmlName('CustomObject');
    accountMetadataFile.setAbstractPath();
    testClient.getProject().packageXml.subscribe(accountMetadataFile);
    testClient.getProject().packageXml.writeFileSync();

    var payload = {
      paths: [ path.join(testClient.getProject().path, 'src', 'objects', 'Account.object') ]
    };

    testClient.executeCommand('refresh-metadata', payload)
      .then(function(response) {

        response.message.should.equal('Metadata successfully refreshed');
        fs.existsSync(path.join(testClient.getProject().path, 'src', 'objects', 'Account.object')).should.equal(true);
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  it('should refresh project ', function(done) {
    this.timeout(60000);

    testClient.getProject().packageXml.subscription = {
      ApexClass: '*',
      CustomObject: '*'
    };
    helper.createNewMetadata(testClient, 'ApexClass', 'RefreshProject')
      .then(function() {
        assert.isFile(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshProject.cls'));
        fs.removeSync(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshProject.cls'));
        return;
      })
      .then(function() {
        return testClient.getProject().packageXml.init();
      })
      .then(function() {
        testClient.getProject().packageXml.writeFileSync();
        return testClient.executeCommand('index-metadata');
      })
      .then(function(response) {
        var payload = {
          paths: [ path.join(testClient.getProject().path, 'src') ]
        };
        return testClient.executeCommand('refresh-metadata', payload);
      })
      .then(function(response) {
        response.message.should.equal('Metadata successfully refreshed');
        fs.existsSync(path.join(testClient.getProject().path, 'src', 'objects', 'Account.object')).should.equal(true);
        fs.existsSync(path.join(testClient.getProject().path, 'src', 'classes')).should.equal(true);
        path.join(testClient.getProject().path, 'src', 'classes', 'RefreshProject.cls').should.be.a.file('RefreshProject is missing');
        done();
      })
      .catch(function(err) {
        done(err);
      });
  });

  // it('should refresh a Lightning bundle from the server ', function(done) {
  //   this.timeout(20000);

  //   var payload = {
  //     apiName : 'mmunittestrefresh',
  //     description : 'something_fun',
  //     createController: true,
  //     createHelper: true,
  //     createStyle: true,
  //     createDocumentation: true,
  //     createRenderer: true
  //   };
  //   testClient.executeCommand('new-lightning-app', payload, function(err, response) {
  //     should.equal(err, null);
  //
  //     response.message.should.equal('Lightning app created successfully');
  //     assert.isDirectory(path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh'),  'Lightning bundle not created');
  //     assert.isFile(path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh', 'mmunittestrefresh.app'),  'Lightning app not created');
  //     assert.isFile(path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh', 'mmunittestrefresh.auradoc'),  'Lightning doc not created');
  //     assert.isFile(path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh', 'mmunittestrefresh.css'),  'Lightning css not created');
  //     assert.isFile(path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh', 'mmunittestrefreshController.js'),  'Lightning controller not created');
  //     assert.isFile(path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh', 'mmunittestrefreshHelper.js'),  'Lightning helper not created');
  //     assert.isFile(path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh', 'mmunittestrefreshRenderer.js'),  'Lightning renderer not created');

  //     fs.removeSync(path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh', 'mmunittestrefreshRenderer.js'));

  //     var payload = {
  //       paths: [ path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh') ]
  //     };

  //     testClient.executeCommand('refresh-metadata', payload, function(err, response) {
  //       should.equal(err, null);
  //
  //       response.message.should.equal('Metadata successfully refreshed');
  //       path.join(testClient.getProject().path, 'src', 'aura', 'mmunittestrefresh', 'mmunittestrefreshRenderer.js').should.be.a.file('Lightning renderer file is missing');
  //       done();
  //     });

  //     done();
  //   });
  // });

  // it('should refresh a Document folder from the server ', function(done) {
  //   this.timeout(20000);

  //   var accountMetadata = new Metadata({ project: testClient.getProject(), metadataTypeXmlName: 'CustomObject', apiName: 'Account' });
  //   testClient.getProject().packageXml.subscribe(accountMetadata);
  //   testClient.getProject().packageXml.writeFileSync();

  //   var payload = {
  //     paths: [ path.join(testClient.getProject().path, 'src', 'objects', 'Account.object') ]
  //   };

  //   testClient.executeCommand('refresh-metadata', payload, function(err, response) {
  //     should.equal(err, null);
  //
  //     response.message.should.equal('Metadata successfully refreshed');
  //     path.join(testClient.getProject().path, 'src', 'objects', 'Account.object').should.be.a.file('Account object file is missing');
  //     done();
  //   });
  // });

  // it('should refresh a directory from the server', function(done) {
  //   this.timeout(20000);

  //   helper.createNewMetadata(testClient, 'ApexClass', 'RefreshMetadataClassDirectory2')
  //     .then(function() {
  //       return helper.createNewMetadata(testClient, 'ApexClass', 'RefreshMetadataClassDirectory3');
  //     })
  //     .then(function() {
  //       fs.removeSync(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass2.cls'));
  //       fs.removeSync(path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass3.cls'));
  //       var payload = {
  //         paths: [ path.join(testClient.getProject().path, 'src', 'classes') ]
  //       };
  //       setTimeout(function() {
  //         testClient.executeCommand('refresh-metadata', payload, function(err, response) {
  //           console.log(err);
  //           console.log(response);
  //           should.equal(err, null);
  //
  //           response.message.should.equal('Metadata successfully refreshed');
  //           // path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass2.cls').should.be.a.file('RefreshMetadataClass2 is missing');
  //           done();
  //         });
  //       }, 10000);
  //       // testClient.executeCommand('refresh-metadata', payload, function(err, response) {
  //       //   console.log(err);
  //       //   console.log(response);
  //       //   should.equal(err, null);
  //       //
  //       //   response.message.should.equal('Metadata successfully refreshed');
  //       //   // path.join(testClient.getProject().path, 'src', 'classes', 'RefreshMetadataClass2.cls').should.be.a.file('RefreshMetadataClass2 is missing');
  //       //   done();
  //       // });
  //     })
  //     .done();
  // });
});

