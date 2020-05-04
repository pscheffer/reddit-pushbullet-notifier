#!/usr/bin/env node
require('dotenv').config()
const args = require('args')
const sa = require('superagent')
const parser = require('xml2json')
const moment = require('moment')
const pushbullet = require('pushbullet')
const pusher = new pushbullet(process.env.PUSHBULLET_ACCESS_TOKEN)

// config of args and defaults
args
  .option('subreddit', 'String - Subreddit you want to match within.')
  .option('post', 'String - Post title you want to match against. Required if no Have or Want args are present. Should be used instead of those if you want to search the entire string or in conjunction with. Really, go wild.')
  .option('have', 'String -[H] marketplace post title you want to match against. Required if no Post or Want args are present.')
  .option('want', 'String - [W] marketplace post title you want to match against. Required if no Post or Have args are present.')
  .option('interval', 'Number - Interval that script checks for new posts.')

const flags = args.parse(process.argv)
const config = {
  subreddit: '',
  post: '',
  have: '',
  want: '',
  interval: 300 // 5 minutes in seconds
}

/**
 * Validates passed in args
 * Returns Boolean
 * TODO: verify subreddit exists
 */
const validateArgs = async () => {
  let valid = {
    subreddit: false,
    post: false,
    post_array: false,
    interval: false
  }

  if(typeof flags.subreddit === 'string') {
    // use /new.rss to get the latest
    let subreddit = `https://reddit.com/r/${flags.subreddit}/new.rss`
    valid.subreddit = true
    config.subreddit = subreddit
  }

  // match inputs
  if(typeof flags.post === 'string') {
    valid.post = true
    config.post = flags.post.split(',')
  }

  if(typeof flags.have === 'string') {
    valid.have = true
    config.have = flags.have.split(',')
  }

  if(typeof flags.want === 'string') {
    valid.want = true
    config.want = flags.want.split(',')
  }

  if(typeof flags.interval === 'undefined' || typeof flags.interval === 'number') {
    valid.interval = true
    if(typeof flags.interval !== 'undefined') {
      config.interval === flags.interval
    }
  }

  // check for all required params
  return valid.subreddit && valid.interval && (valid.post || valid.have || valid.want)
}

/**
 * Brute Force! Download the RSS and parse Buffer to a JS Object
 * Returns object
 */
const downloadPostsFromRSS = async () => {
  try {
    var rss_feed_xml = await sa.get(config.subreddit).set('Accept', 'application/atom+xml')
    var rss_obj = JSON.parse(parser.toJson(rss_feed_xml.body.toString('utf8')))
    return rss_obj.feed.entry || []
  } catch (error) {
    console.error(new Error(error))
    process.exit(1)
  }
}

/**
 * Takes array of title matches and compares with title to look for matches
 * @param {*} title_matches 
 * @param {*} title
 * Returns Boolean
 */
const matchTitles = (title_matches, title) => {
  var matches = false
  let i = 0
  do {
    matches = title.indexOf(title_matches[i].toLowerCase().trim()) !== -1
    if(matches) {
      break
    } 
    i++
  } while (i < title_matches.length)
  return matches
}

/**
 * Checks the incoming title against all possible match queries
 * @param {*} title 
 */
const findMatch = (title) => {
  title = title.toLowerCase()
  var matches = false

  if(config.post) {
    matches = matchTitles(config.post, title)
  }

  if(config.have || config.want) {
    // forums that use [H] [W] title formats should create two array strings for which we can search
    var split_title = title.split('[w]')

    if(config.have) {
      matches = matchTitles(config.have, split_title[0])
    }

    if(config.want && split_title[1]) {
      matches = matchTitles(config.want, split_title[1])
    }

  }

  return matches
}

/**
 * Searches Reddit Posts to look for matches against config
 * @param {*} posts 
 * @param {*} current_ms
 */
const searchPostsForMatches = (posts, current_ms) => {
  var matches = []
  var i = 0
  var interval_ms = current_ms - (config.interval * 1000)
  // for each post
  do {
    // if time is within interval
    var post_ms = moment(posts[0].updated).utc().valueOf()
    if(post_ms >= interval_ms) {
      // check if title matches our pattern, simple lowercase check
      if(findMatch(posts[i].title)) {
        matches.push({
          title: posts[i].title,
          url: posts[i].link.href
        })
      }
    }
    i++
  } while (i < posts.length)

  return matches
}

/**
 * Sends Pushbullet links to all devices
 * TODO: allow user to provde device ID(s)
 * @param {*} matches 
 */
const sendBullets = async (matches) => {
  let i = 0
  do {
    try {
      var pb_res = await pusher.link({}, matches[i].title, matches[i].url)
      i++
    } catch(error) {
      console.error(new Error(error))
    }
  } while (i < matches.length)
}

/**
 * Downloads RSS, checks for updates, and sends Pushbullet Notifications
 * Does NOT alert user of attempts with no matches
 */
const checkForUpdates = async () => {
  // cache current time to check if content was created between interval and now
  var current_ms = moment().utc().valueOf()
  var posts = await downloadPostsFromRSS()
  if(posts.length) {
    var matches = searchPostsForMatches(posts, current_ms)
    if(matches.length) {
      sendBullets(matches)
    }
  }
}

/**
 * Main function
 */
const run = () => {
  // check once and then let the interval take over
  checkForUpdates()

  setInterval(function (){
    checkForUpdates()
  }, config.interval * 1000)
} 

/**
 * Fires script if required args are present
 */
if(!validateArgs()) {
  args.showHelp()
  process.exit(1)
} else {
  run()
}