# reddit-pushbullet-notifier
Used to notify you of new posts on Reddit that match a subreddit and post title. Script will query Reddit every 5 minutes unless overriden.

When matches are found, they are posted to your pushbullet account. All devices are chosen by default but can be overriden.

The goal of this project was to act like saved searches for marketplaces, but can be used to notify you of other new posts that match your search.

Currently uses RSS which has a server interval of (x) minutes. Setting a shorted interval for this script won't net you results sooner.

TODO: Allow for page scraping as well.

## Requirements
* NodeJS (https://nodejs.org/en/)
* Pushbullet Account
  * Pushbullet Access Token (https://www.pushbullet.com/#settings)

## Installation
1. Install Node Modules:
```
yarn install
```

```
npm install
```
2. Create an `.env` file and add your Pushbullet Access token:
```
PUSHBULLET_ACCESS_TOKEN=your_pushbullet_api_key
```

## Options
| Options | Field       | Description                                                                                     | Required | 
| ------- | ----------- | ----------------------------------------------------------------------------------------------- | -------- |
| `-s`    | Subreddit   | Subreddit you want to search within                                                             | x        |
| `-p`    | Posts       | String* of Posts you want to search for. Required if no Have or Want flags are present.         |          |
| `-h`    | Have        | String* of [H] style marketplace Posts you want to search for.                                  |          | 
| `-w`    | Want        | String* of [W] style marketplace Posts you want to search for.                                  |          |  
| `-i`    | Interval    | Interval in seconds between script checking for updates                                         |          |

* You can pass in a comma separated list and the script will search for multiple posts.
## Examples

```
node index.js -s mechmarket -h "RAMA M60-A"
```

```
node index.js -s hardwareswap -w "RTX 2080ti" -i 60
```

```
node index.js -s aquariums -p "Living plants"
```

```
node index.js -s mechmarket -h "RAMA M60-a, Tofu HHKB, Tokyo60"
```


## Exit
Good 'ol `ctrl + c`.