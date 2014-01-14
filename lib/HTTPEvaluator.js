var iz = require('iz-objects');
var http = require('http');
var https = require('https');
var url = require('url');
var querystring = require('querystring');


/**

**** HTTP Evaluator ****

This class performs an HTTP request based on the parameters given and captures the result.
You can then perform various checks on the result to verify expected behavior. 
It is primarily of use in application test suites that must actually run against 
an active web or application server.

The HTTP evaluator can be used directly, as shown below, or can be used to capture
the result of an HTTP call you made directly.  

Usage:

        // Perform the request directly.
        var evaluator = new iz.Module('HTTPEvaluator')();

        evaluator.request({
            host: 'www.example.com',
            path: '/index.php'
        }, function(ev) {
            
            assert( ev.has_header_value('content-type', 'text/html') );
            assert( ev.body_contains('Example Domain') );

        });

To capture an HTTP response from a request you created manually:

        var evaluator = new iz.Module('HTTPEvaluator')();

        // do http request
        http.request(options, function(res) {
            evaluator.capture_http_response(res, encoding, function(ev) {
                assert( ev.has_header_value('content-type', 'text/html') );
                assert( ev.body_matches(/expected body text/) );
            });
        })

It is safe to use the same evaluator object for multiple requests, as each
response is wrapped individually. 

It is important to note that the HTTP Evaluator captures the entire response
stream into a buffer.  This means that if you are testing something that
responds with a very large amount of data, you should probably not use this
module, as you _will_ exceed your ram.

All methods return a true/false value.

The methods available on the response are:

    res.has_header(headername)

        Returns true if the response has the header specified.  Does not 
        check value, only existence.

    res.has_header_value(headername, value)

        Returns true if the response has the header specified and
        it's value is the value given.  With headers that have 
        multiple values, returns true if the value is present,
        even if other values are also present.

    res.has_headers(array_of_header_names)

        Returns true if the response has all the headers provided,
        regardless of their values.

    res.has_headers(header_object)

        Accepts a header_object containing headername: value pairs.
        Returns true if _all_ the headers and related values are found
        in the response.

    res.body_contains(string, encoding)

        Returns true if the response body contains the string provided.
        Uses encoding for string encoding.  Encoding defaults to 'utf8'

    res.body_matches(regex, encoding)

        Returns true if response body matches the given regex. 
        Uses encoding for string encoding. Encoding defaults to 'utf8'

    res.body_identical_to_buffer(buf) 

        Returns true if response body is identical to the provided buffer.

    res.body_identical_to_file(filename)

        Returns true if response body is identical to the contents of 
        the provided file.  Note the file is read syncronously. If you 
        don't want that, load the file yourself and call 
        res.body_identical_to_buffer instead.

*** Using the Evaluator's request methods ***

There are two methods for making an HTTP request using the HTTP evaluator.


1) evaluator.request(options, callback)
    This call works mostly like nodes native http request call and
    the options are mostly compatible.  This call, however, handles 
    the outgoing data stream differently.  The evaluator.request 
    call provides for two additional fields in the options object:

    a) options.params - An object representing the key=value pairs
       to be sent to the remote system.  The parameters are encoded
       and either added to the query string (as in the case of a GET) or
       prepared for sending via POST to the remote system. (Note that
       if you use this mechanism, the content-type and length headers
       are set by the evaluator prior to sending, and any previous 
       values are lost)

    b) options.post_data - if you prefer to encode your own post_data
       you may do so and place the encoded data here. This data is then
       transmitted to the remote side at the appropriate time.  Note that
       this data is completely ignored if options.method is not POST. 
       Note also that if you use post_data, you must set the POST related
       headers by hand (content-length / content-type for example.)

2) evaluator.request(options, data, callback) 
    This call works identically to the above evaluator.request method
    except that you may provide a buffer or stream in the 'data' 
    parameter.  This data is what is to be sent to the remote system.
    If you provide 'data', the other POST related parameter options 
    are ignored and it is assumed you will provide the correct data 
    stream to be sent to the remote side.

*/


module.exports = iz.Package('HTTPEvaluator', function(Class, SUPER) {

    iz.Use('StreamCatcher');

    Class.has({
        req: { isa: 'object'},
        response: { isa: 'object' },
        response_data: { isa: 'object' }
    });


    Class.request = function(options, callback) {

        return this.request_with_data(options, undefined, callback);

    };

    Class.request_with_data = function(provided_options, data, callback) {
        var options = provided_options;

        if (typeof options.url === 'string') {
            var tmp_options = url.parse(options.url);
            options = {};
            options.hostname = tmp_options.hostname;
            options.port = tmp_options.port;
            options.path = tmp_options.path;
            options.protocol = tmp_options.protocol;
        }

        if (typeof options.params === 'object') {
            // This means we have params.  Let's encode the params and add to URL stream.
            var encoded_params = querystring.stringify(options.params);
            if (typeof data === 'undefined' && options.method.toUpperCase() === 'POST' 
                && typeof options.post_data === 'undefined') {

                options.headers['content-type'] = 'application/x-www-form-urlencoded';
                options.headers['content-length'] = encoded_params.length;
                options.post_data = encoded_params;
            } else {
                if (/\?/.test(options.path)) {
                    options.path += options.path + "&" + encoded_params;
                } else {
                    options.path += options.path + "?" + encoded_params;
                }
            }
        }

        var http_or_https = http;
        if (options.secure === true || options.protocol === 'https:') {
            http_or_https = https;
        }

        var req = http_or_https.request(options, function(res) {
            this.capture_http_response(res, options.encoding, callback);
        }.bind(this));

        if (typeof data === 'undefined') {
            if ((options.method !== undefined && options.method.toUpperCase() === 'POST') && typeof options.post_data !== undefined) {
                req.write(options.post_data);
            }
            req.end();
        } else {
            if (/(GET|HEAD|DELETE)/i.test(options.method)) {
                // these methods don't take a body.  Shame.. don't try to give me one.  I'll just ignore it.
                req.end();
            } else {
                if (typeof data === 'string' || Buffer.isBuffer(data)) {
                    req.write(data);
                    req.end();
                } else {
                    // we have a stream.
                    data.on('end', function() { req.end(); });
                    data.pipe(req);
                }
            }
        }
    }

    Class.capture_http_response = function(res, enc, callback) {
            var evaluator = new iz.Module('HTTPEvaluator')();

            evaluator.response(res);
            // set encoding;
            var encoding = enc || 'utf8';
            res.setEncoding(encoding);
            var streamcatcher = new iz.Use('StreamCatcher')();
            //console.log('piping result into streamcatcher');
            res.on('end', function() {
                //console.log('streamcatcher end received');
                evaluator.response_data(streamcatcher.get_all_data());
                streamcatcher.clear_captured_data();
                callback(evaluator);
            });
            res.pipe(streamcatcher);
    };

    Class.body_identical_to_file = function(filename) {
        var file_data = fs.readFileSync(filename);
        this.response_identical_to_buffer(file_data);       
    };

    Class.body_identical_to_buffer = function(buf) {
        var response_data = this.response_data();

        if (buf.length !== response_data.length()) {
            return false;
        } else {
            // size is the same.  What about data?
            for (var i = 0; i < response_data.length; i++) {
                if (response_data[i] !== buf[i]) {
                    return false;
                }
            }
            // if we get here, our comparison was byte-for-byte correct to the end of the buffer;
            return true;
        }
    };


    Class.body_contains = function(str, encoding) {
        var regex = new RegExp(str);
        return this.body_matches(regex, encoding);
    };

    Class.body_matches = function(regex, encoding) {
        //console.log(regex);
        var my_encoding = encoding || 'utf8';
        return regex.test(this.response_data().toString(my_encoding));
    };

    Class.status_code_is = function(code) {
        return (this.statusCode === code);
    }

    Class.has_header = function(header) {
        var header_name = header.toLowerCase();
        if (typeof this.response().headers[header_name] === 'undefined') {
            return false;
        } else {
            return true;
        }
    };

    Class.has_header_value = function(header, value) {
        var header_name = header.toLowerCase();
        if (this.has_header(header_name)) {
            var header_val = this.response().headers[header_name];
            if (header_val === value) {
                return true;
            } else if (/,/.test(header_val)) {
                var vals = header_val.split(/,/);
                var found=false;
                for (var i = 0; i < vals.length; i++) {
                    if (vals[i] === value) {
                        found = true;
                        break;
                    }
                };
                return found;
            } 
        } 
        return false;
    }

    // accepts an object containing header/value pairs OR an array of header-names
    // if you just want to check for the existance of certain headers

    Class.has_headers = function(headers) {
        var found=0;
        if (Array.isArray(headers)) {
            for (var i = 0; i < headers.length; i++) {
                if (this.has_header(headers[i])) {
                    found++;
                }
            }

        } else {
            var keys = Object.keys(headers);
            for (var i = keys.length - 1; i >= 0; i--) {
                var key = keys[i];
                if (this.has_header_value(key, headers[key])) {
                    found++;
                }
            }
        }

        if (found === headers.length) {
            return true;
        } else {
            return false;
        }
    }

    return Class;

});