#!/usr/bin/env node
require('dotenv').config()
const args = require('args')
const rp = require('request-promise-native')
const cheerio = require('cheerio')
const pushbullet = require('pushbullet')
const pusher = new pushbullet(process.env.PUSHBULLET_ACCESS_TOKEN)

// config of args and defaults
args
  .option('subreddit', 'String - Subreddit you want to match within.')
  .option('post', 'String - Post title you want to match against. Required if no Have or Want args are present. Should be used instead of those if you want to search the entire string or in conjunction with. Really, go wild.')
  .option('have', 'String -[H] marketplace post title you want to match against. Required if no Post or Want args are present.')
  .option('want', 'String - [W] marketplace post title you want to match against. Required if no Post or Have args are present.')
  .option('interval', 'Number - Interval in seconds that script checks for new posts. Max interval is 3540 (59 minutes) as the scraper uses the rendered post time stamp which renders as: just now, X minutes ago, X hours ago, etc. 59 minutes is the last level of accuracy that is useful to avoid dupes.')

const flags = args.parse(process.argv)
const config = {
  subreddit: '',
  post: '',
  have: '',
  want: '',
  interval: 15 // 5 minutes in seconds
}

/**
 * Validates passed in args
 * @returns {boolean}
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
    let subreddit = `https://reddit.com/r/${flags.subreddit}/new`
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

  if(typeof flags.interval === 'undefined' || (typeof flags.interval === 'number' && flags.interval <= 3540)) {
    valid.interval = true
    if(typeof flags.interval !== 'undefined') {
      config.interval === flags.interval
    }
  }

  // check for all required params
  return valid.subreddit && valid.interval && (valid.post || valid.have || valid.want)
}

/**
 * Brute Force! Download the HTML and parse Buffer to a JS Object
 * @returns {Object}
 */
const downloadPostsFromHtml = async () => {
  try {
    var options = {
      uri: config.subreddit,
      transform: (body) => {
        return cheerio.load(body)
      }
    }
    var $ = await rp(options)

    var posts = [];

    $('.Post').each( (i, el) => {
      let post = {
        title: $(el).find('h3').text(),
        time: $(el).find('a[data-click-id="timestamp"]').text(),
        url: $(el).find('a[data-click-id="timestamp"]').attr('href')
      }
      posts.push(post)
    })
    
    return posts
  } catch (error) {
    console.error(new Error(error))
    process.exit(1)
  }
}

/**
 * Takes array of title matches and compares with title to look for matches
 * @param {array} title_matches 
 * @param {string} title
 * @returns {boolean}
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
 * @param {string} title 
 * @returns {boolean}
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
 * Parses string that we can use as a time interval
 * @param {string} time_string 
 * @returns {number} time in seconds
 */
const parseTime = (time_string) => {
  var time = false
  // just now
  if(time_string === 'just now') {
    time = 0
  } 
  // minutes
  else if (time_string.indexOf('minutes') !== -1) {
    time = parseInt(time_string) * 60
  }
  // hours/days/weeks/years are too long to have a proper interval
  return time
}

/**
 * Searches Reddit Posts to look for matches against config
 * @param {array} posts 
 * @returns {array} matches 
 */
const searchPostsForMatches = (posts) => {
  var matches = []
  var i = 0
  // for each post
  do {
    // if time is within interval
    var parsed_time = parseTime(posts[i].time)
    if(parsed_time && (parsed_time <= config.interval)) {
      // check if title matches our pattern, simple lowercase check
      if(findMatch(posts[i].title)) {
        matches.push({
          title: posts[i].title,
          url: posts[i].url
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
 * @param {array} matches 
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
  var posts = await downloadPostsFromHtml()
  if(posts.length) {
    var matches = searchPostsForMatches(posts)
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