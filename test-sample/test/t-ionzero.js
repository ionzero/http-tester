var iz = require('iz-objects');
var izu = require('iz-utils');
var HTTPEvaluator = iz.Module('HTTPEvaluator');

var assert = require('assert');
var util = require('util');

describe('Check HTTP request for Ionzero', function () {

    var response;
    before(function(done) {
        var req = new HTTPEvaluator();

        req.request({
            host: 'www.ionzero.com',
            path: '/index.php'
        }, function(res) {
            response = res;
            done();
        });
    });


    describe('Ionzero Test', function() {
        
            it('has expected content', function() {
//                assert.ok(response.body_matches(/third party integration/));
                assert(response.body_contains("third party integration"));
            });

            it('has expected content-type', function() {
                assert(response.has_header_value('content-type', 'text/html'));
            });
    });

});