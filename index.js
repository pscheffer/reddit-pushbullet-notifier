#!/usr/bin/env node
require('dotenv').config()
const args = require('args')
const moment = require('moment')
const pushbullet = require('pushbullet')
const pusher = new pushbullet(process.env.PUSHBULLET_ACCESS_TOKEN)
const bent = require('bent')
const form_urlencoded = require('form-urlencoded')

const REDDIT_USERNAME = process.env.REDDIT_USERNAME
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID
const REDDIT_SECRET = process.env.REDDIT_SECRET
const USER_AGENT = 'nodejs:search.pushbullet.notifier.for reddit:1.0'

const REDDIT_API = 'https://oauth.reddit.com'
const REDDIT_OAUTH = 'www.reddit.com/api/v1/access_token'

var SESSION = {}
var SENT_POSTS = []

// config of args and defaults
args
  .option('subreddit', 'String - Subreddit you want to match within.')
  .option('type', 'String - Determines what type of search you want to do. full searches the entire title. have searches the [H] section of titles. want searches the [W] seaction of titles. \n\nAllowed Values: full, have, want\nDefault: full\n')
  .option('keywords', 'String - Keywords you want to search for within the title. Each Keyword/phrase must be an exact match for you to be notified. Use a comma delimited list for multipe phrases. ie. "Gateron, Zealios"')
  .option('country', 'String - Country or countries you want to limit posts to. If provided, the country code must be present in the title, ie. "[US-CA]". Use a comma separated list to search for multiple countries.')
  .option('interval', 'Number - Interval in seconds that script checks for new posts. Minimum is 1. \n\nDefault: 5 \n')

const flags = args.parse(process.argv)
const config = {
  subreddit: '',
  type: 'full',
  keywords: '',
  country: '',
  interval: 5
}
const allowed_types = ['full', 'have', 'want']

/**
 * Validates passed in args
 * @returns {boolean}
 * TODO: verify subreddit exists
 */
const validateArgs = async () => {
  let valid = {
    subreddit: false,
    type: true,
    keywords: false,
    interval: false,
    country: true
  }

  if(typeof flags.subreddit === 'string') {
    valid.subreddit = true
    config.subreddit = flags.subreddit
  }

  if(typeof flags.type === 'string') {
    if(allowed_types.indexOf(flags.type.toLowerCase()) === -1) {
      valid.type = false
    } else {
      config.type = flags.type
    }
  }

  // match inputs
  if(typeof flags.keywords === 'string') {
    valid.keywords = true
    config.keywords = flags.keywords.split(',').map((arg) => {
      return arg.trim()
    })
  }

  if(typeof flags.country === 'string') {
    config.country = flags.country.split(',').map((arg) => {
      return arg.trim()
    })
  }

  if(typeof flags.interval === 'undefined' || (typeof flags.interval === 'number' && flags.interval >= 1)) {
    valid.interval = true
    if(typeof flags.interval !== 'undefined') {
      config.interval = flags.interval
    }
  }

  // check for all required params
  return valid.subreddit && valid.type && valid.keywords && valid.interval
}

/**
 * Takes array of title matches and compares with title to look for matches
 * @param {array} title_matches 
 * @param {string} title
 * @returns {boolean}
 */
const matchTitles = (queries, title) => {
  var title_matched = false
  let i = 0
  do {
    title_matched = title.indexOf(queries[i].toLowerCase().trim()) !== -1
    if(title_matched) {
      break
    } 
    i++
  } while (i < queries.length)

  return title_matched
}

/**
 * Takes array of title matches and compares with title to look for matches
 * @param {array} title_matches 
 * @param {string} title
 * @returns {boolean}
 */
const matchCountries = (countries, title) => {
  var country_matched = false
  let i = 0
  do {
    country_matched = title.substr(1, 2).toLocaleLowerCase() === countries[i].toLocaleLowerCase().trim()
    if(country_matched) {
      break
    } 
    i++
  } while (i < countries.length)

  return country_matched
}

/**
 * Checks the incoming title against all possible match queries
 * @param {string} title 
 * @returns {boolean}
 */
const findMatch = (title) => {
  title = title.toLowerCase()
  var title_matched = false
  var country_matched = false
  if(config.country) {
    country_matched = matchCountries(config.country, title)
  }
  
  if(config.country.length === 0 || country_matched) {

    if(config.type !== 'full') {
      var split_title = title.split('[w]')
      title = config.type === 'have' ? split_title[0] : split_title[1]
    }

    title_matched = matchTitles(config.keywords, title)
  
  }

  return title_matched
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
    if(posts[i].data) {
      if(findMatch(posts[i].data.title)) {
        matches.push({
          id: posts[i].data.id,
          title: posts[i].data.title,
          url: `https://www.reddit.com${posts[i].data.permalink}`
        })
      }
    } else {
      console.error('Invalid Post: ', posts[i])
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
const sendPushBulletLink = async (matches) => {
  let i = 0
  do {
    try {
      // check if the post was already matched/sent and skip it if it was
      if(SENT_POSTS.indexOf(matches[i].id) === -1) {
        await pusher.link({}, matches[i].title, matches[i].url)
        SENT_POSTS.push(matches[i].id)
      }
      i++
    } catch(error) {
      console.error(new Error(error))
    }
  } while (i < matches.length)
}

/**
 * Sends Pushbullet notes to all devices
 * TODO: allow user to provde device ID(s)
 * @param {array} matches 
 */
const sendPushBulletNote = async (notes) => {
  let i = 0
  do {
    try {
      await pusher.note({}, notes[i].title, notes[i].text)
      i++
    } catch(error) {
      throw new Error(error)
    }
  } while (i < notes.length)
}


/**
 * Uses the Reddit API to list posts
 * @returns {array} posts
 */
const getRedditPosts = async () => {
  try {
    const bent_reddit = bent(REDDIT_API, 'GET', 'json', 200, 401, 502, 503, {
      'User-Agent': USER_AGENT,
      'Authorization': `${SESSION.token_type} ${SESSION.access_token}`,
      'Accept': 'application/json'
    })
    const endpoint = `/r/${config.subreddit}/new`
    const posts = await bent_reddit(endpoint)
    // todo, if 401, re-authorize
    if(posts.error) {
      throw posts.error
    } else {
      return posts.data.children || []
    }
  } catch(error) {
    throw new Error(error)
  }
}

/**
 * Downloads RSS, checks for updates, and sends Pushbullet Notifications
 * Does NOT alert user of attempts with no matches
 */
const checkForUpdates = async () => {
  try {
    var posts = await getRedditPosts()
    if(posts.length) {
      var matches = searchPostsForMatches(posts)
      if(matches.length) {
        sendPushBulletLink(matches)
      }
    }
  } catch(error) {
    console.error(error)
  }
}

/**
 *  Set session data and refresh the token before it expires
 * @param {objet} session 
 */
const setSession = (session) => {
  SESSION = session
  // generate new token before it expires
  // refresh does not seem to work with this direct path grant
  // expires - 3s to be safe
  setInterval(function (){
    generateRedditAuthToken(false)
  }, (SESSION.expires_in - 3) * 1000)
}

/**
 * Initial auth token generation
 * Kills script if it doesn't authenticate
 */
const generateRedditAuthToken = async (refresh) => {
  try {
    var post_body = {}

    if(refresh) {
      post_body.grant_type = 'refresh_token'
      post_body.refresh_token = SESSION.access_token
    } else {
      post_body.grant_type = 'password'
      post_body.duration = 'permanent'
      post_body.password = REDDIT_PASSWORD
      post_body.username = REDDIT_USERNAME
    }
    
    const post_body_str = form_urlencoded.default(post_body)

    const uri = `https://${REDDIT_CLIENT_ID}:${REDDIT_SECRET}@${REDDIT_OAUTH}`

    const reddit_post = bent('POST', 'json', 200, 400, 401, {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    })

    const reddit_response = await reddit_post(uri, post_body_str)

    if(reddit_response.error) {
      throw new Error(reddit_response.error, reddit_response.message)
    } else {
      setSession(reddit_response)
    }
  } catch(error) {
    throw new Error(error)
  }
}

/**
 * Main function
 */
const run = async () => {
  try {
    let message = `${moment().format('MMMM Do YYYY, h:mm:ss a')}: Searching [${config.type}] ${config.subreddit} for ${config.keywords}`
    if(config.country.length) {
      message += ` from ${config.country}`
    }
    await sendPushBulletNote([{
      title: 'Starting Pushbullet Notifier for Reddit',
      text: message
    }])
    await generateRedditAuthToken(false)

    // check once and then let the interval take over
    checkForUpdates()

    setInterval(function (){
      checkForUpdates()
    }, config.interval * 1000)
  } catch (error) {
    console.error(error)
    try {
      await sendPushBulletNote([{
        title: 'Error - shutting down Pushbullet Notifier for Reddit',
        text: `${moment().format('MMMM Do YYYY, h:mm:ss a')}: ${error}`
      }])
      process.exit(1)
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  }
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