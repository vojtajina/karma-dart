var path = require('path');
var fs = require('fs');

var format = require('util').format;
var areEqual = require('./util').areEqual;
var random = function() {
  return Math.round(Math.random() * 10000);
};

var DART_ADAPTER_TPL = fs.readFileSync(__dirname + '/../static/adapter.dart.tmpl').toString();
var TEMP_DIR = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
var DART_IMPORT = 'import "%s" as %s;';


var initDartUnittest = function(emitter, /* config.files */ files, /* config.basePath */ basePath,
  /* config.karmaDartImports */ customImports, logger) {

  var log = logger.create('dart');

  // include the adapter.js
  files.unshift({pattern: __dirname + '/adapter.js', included: true, served: true, watched: false});

  var adapterImports = {
    unittest: 'package:unittest/unittest.dart',
    js: 'package:js/js.dart'
  };

  if (customImports) {
    Object.keys(customImports).forEach(function(library) {
      adapterImports[library] = customImports[library];
    });
  }

  var adapterImportsCode = Object.keys(adapterImports).map(function(library) {
    return format(DART_IMPORT, adapterImports[library], library);
  }).join('\n');

  var dartAdapterFile = {
    path: basePath + '/__adapter_dart_unittest.dart',
    contentPath: path.normalize(TEMP_DIR + '/karma-dart-adapter-' + random() + '.dart'),
    isUrl: false,
    mtime: new Date()
  };

  var previousDartTestFiles = [];

  emitter.on('file_list_modified', function(filesPromise) {
    filesPromise.then(function(files) {
      var dartTestFiles = [];
      var dartTestFilePaths = [];
      var includedFiles = [dartAdapterFile];

      // All *.dart included files are considered to be test libraries.
      files.included.forEach(function(file) {
        if (path.extname(file.path) === '.dart') {
          dartTestFiles.push(file);
          dartTestFilePaths.push(file.path);
        } else {
          includedFiles.push(file);
        }
      });

      // filtered (without dart test files, the adapter will include them)
      files.included = includedFiles;
      files.served.push(dartAdapterFile);

      // Did the list of included test files changed ?
      // If so, update the adapter files, which contains all the imports.
      if (!areEqual(previousDartTestFiles, dartTestFilePaths)) {
        log.debug('List of dart files changed, updating the list of imports.');

        var testImports = [];
        var mainCalls = [];
        dartTestFiles.forEach(function(dartFile, index) {
          var filePath = dartFile.path;
          if (filePath.indexOf(basePath) === 0) {
            filePath = '/base' + filePath.substr(basePath.length);
          } else {
            filePath = '/absolute' + filePath;
          }
          testImports.push(format(DART_IMPORT, filePath, 'test_' + index));
          mainCalls.push(format('  test_%s.main();', index));
        });

        // TODO(vojta): skip this writeFileSync() once we can use in-memory cache (file.content)
        fs.writeFileSync(dartAdapterFile.contentPath, DART_ADAPTER_TPL
            .replace('/*%ADAPTER_IMPORTS%*/', adapterImportsCode)
            .replace('/*%TEST_IMPORTS%*/', testImports.join('\n'))
            .replace('/*%TEST_MAIN_CALLS%*/', mainCalls.join('\n')));

        dartAdapterFile.mtime = new Date();
        previousDartTestFiles = dartTestFilePaths;
      }
    });
  });
};

module.exports = {
  'framework:dart-unittest': ['factory', initDartUnittest]
};
