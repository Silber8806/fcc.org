 /******************************************************
 * PLEASE DO NOT EDIT THIS FILE
 * the verification process may break
 * ***************************************************/

'use strict';

var fs = require('fs');
var express = require('express');
var app = express();
var mongo = require('mongodb').MongoClient;
var database_url = 'mongodb://' + process.env.db_user + ':' + process.env.db_password + '@ds141534.mlab.com:41534/nicohunters'
var validUrl = require('valid-url');
var request = require('request');
var multer  = require('multer');
var upload = multer({ dest: 'uploads/' })

if (!process.env.DISABLE_XORIGIN) {
  app.use(function(req, res, next) {
    var allowedOrigins = ['https://narrow-plane.gomix.me', 'https://www.freecodecamp.com'];
    var origin = req.headers.origin || '*';
    if(!process.env.XORIG_RESTRICT || allowedOrigins.indexOf(origin) > -1){
         console.log(origin);
         res.setHeader('Access-Control-Allow-Origin', origin);
         res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    }
    next();
  });
}

app.use('/public', express.static(process.cwd() + '/public'));

app.route('/_api/package.json')
  .get(function(req, res, next) {
    console.log('requested');
    fs.readFile(__dirname + '/package.json', function(err, data) {
      if(err) return next(err);
      res.type('txt').send(data.toString());
    });
  });

// this is the get date project...

app.route('/getdate/:date')
  .get(function(req,res,next){
  var date = req.params.date
  var unixtime;
  var natural;
  if (/^([0-9]+)$/.test(date)){
    var day = new Date(date*1000);
    unixtime=date
    natural=day.toISOString()
  } else if (/^[0-9]{4}-[0-1]{1}[0-9]{1}-[0-3]{1}[0-9]{1}$/.test(date)){
    var year=date.split('-')[0];
    var month= date.split('-')[1]-1;
    var day=date.split('-')[2];
    try{
      var day = new Date(year,month,day);
    } catch(err){
      unixtime=null
      natural=null
    }
    unixtime=day.getTime() / 1000
    natural=day.toISOString()
  } else {
    unixtime=null
    natural=null
  }
  var doc_send={unixtime,natural};
  res.setHeader('Content-Type', 'application/json');
  res.send(doc_send);
})

// this is the headers section...

app.route('/computerinfo')
  .get(function(req,res){
    var ip_address=req.headers['x-forwarded-for'];
    var user_agent=req.headers['user-agent'];
    var lang=req.headers['accept-language'];
   var doc_send={ip_address,user_agent,lang}
   res.setHeader('Content-Type', 'application/json');
   res.send(doc_send);
})

// this is the url shortening project.

app.route('/new_url/:old_url(*)')
  .get(function(req,res){
    var original_url = req.params.old_url;
    var new_url = 'https://glacier-group.glitch.me/new_urls/' 
    if (validUrl.isUri(original_url)){   
      mongo.connect(database_url,function(err,db){
      if(err){
        res.sendStatus(500);
      }
      var website = db.collection('websites');
      var website_counters = db.collection('websites_counter');
      website_counters.update(
            { _id: 'websites' },
            { $inc: { seq: 1 }}
       );
      website_counters.find({_id: 'websites'}).toArray(function(err, docs) {
          var new_seq = docs[0].seq;
          var doc = {
            web_number: new_seq,
            redirect_url:original_url
          }
          website.insert(doc, function(err, data) {
              if (err) throw err
              db.close();
              new_url = new_url + new_seq;
              res.send({original_url,new_url}); 
          })
          });
        }) 
    } 
    else {
      res.sendStatus(500);
    }
  }
)

app.route('/new_urls/:url_number')
  .get(function(req,res){
    var url_number = req.params.url_number;
    mongo.connect(database_url,function(err,db){
      if(err){
        res.sendStatus(500);
      }
      var website = db.collection('websites');
      var results = website.find({web_number:parseInt(url_number)});
      results.toArray(function(err, docs) {
        if (err) {
          res.sendStatus(500);
        }
          db.close()
          res.redirect(docs[0].redirect_url);
        })
    })
  }
)

// Image abstraction API.  Please note, I did not implement cacheing on url.

app.route('/getimage/:imageterm')
  .get(function(req,res){
      console.log(req.url)
      if (/\?offset/.test(req.url)){
        var url = req.url;
        console.log(url)
        var option = url.split('?')[1].split('=')[1]
        console.log(option)
      } else {
        var option = 0;
      }
      console.log(option);
      var image_term = req.params.imageterm; 
      var search_req= process.env.pxby_url + '&q=' + image_term + '&image_type=photo'
       mongo.connect(database_url,function(err,db){
            if(err){
              res.sendStatus(500);
            }
            var search_terms = db.collection('search_terms');
            var term = image_term;
            var when = new Date().toISOString();
          
           var doc = {
             term,
             when
           }
           search_terms.insert(doc, function(err, data) {
              if (err) throw err
             db.close();
       })
        request.get(search_req,function (error, response, body){
        if(error) {
          res.sendStatus(500);
        }
        if(res.statusCode !== 200 ){
          res.sendStatus(500);
      } else {
        var json_response = JSON.parse(body,function(k,v){
          if (k === "tags") 
              this.alt_txt = v;
          else
              return v;    
        })['hits'];
        if (option !== 0){
          json_response = json_response.splice(0,parseInt(option));
        }
        res.send(json_response);
      }
    })
  })
})

app.route('/getsearches/')
  .get(function(req,res){
   mongo.connect(database_url,function(err,db){
            if(err){
              res.sendStatus(500);
            }
            var search_terms = db.collection('search_terms');
            search_terms.find().sort({when:-1}).limit(20).toArray(function(err, docs) {
              if(err){
                res.sendStatus(500);
              }
              db.close();
              res.send(docs);
            });       
  })
})

// File Metadata Microservice

app.route('/file_size')
  .get(function(req,res){
  res.sendFile(process.cwd() + '/views/getfile.html');
})

app.post('/file_size', upload.single('file_size'), function (req, res, next) {
  var size = req.file['size'];
  res.send({size});
})
  
// Main route...

app.route('/')
    .get(function(req, res) {
		  res.sendFile(process.cwd() + '/views/index.html');
    })

// Respond not found to all the wrong routes
app.use(function(req, res, next){
  res.status(404);
  res.type('txt').send('Not found');
});

// Error Middleware
app.use(function(err, req, res, next) {
  if(err) {
    res.status(err.status || 500)
      .type('txt')
      .send(err.message || 'SERVER ERROR');
  }  
})

app.listen(process.env.PORT, function () {
  console.log('Node.js listening ...');
});

