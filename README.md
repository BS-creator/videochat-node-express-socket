# videochat-node-express-socket
Express default Project Structure
I added some folders and change structure a little

To run: 'npm install && npm start'

# installation
## connect to server using ssh
## Install Dependencies
- install nvm by following command
  ```
  curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
  ```
- install node by following command
  ```
  nvm install 10.0.0
  ```
- you can check your node version
  ```
  node -v
  ```
- clone the project from gitlab
  ```
  git clone Your-Git-Clone-Url
  ```
- go into the project folder and install dependencies
  ```
  cd folder_name
  npm install
  ```
## Install pm2 to run app in the background forever
  ```
  npm install pm2 -g
  ```

## Install & Configure nginx as a reverse proxy
- install nginx
  ```
  sudo apt install nginx
  ```
- open nginx configure file 
  ```
  nano -w /etc/nginx/sites-enabled/default
  ```
- delete all the content and replace following
  ```
  server {
    listen         80 default_server;
    listen         [::]:80 default_server;
    server_name    roomapi.io;
    root           /usr/share/nginx/html;
  location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
  }
  ```
- after configuration, restart nginx
  ```
  sudo service nginx restart
  ```
- go into the root folder of the project and run app
  ```
  cd /project location
  pm2 start bin/www
  ```
## allow http, https and enable firewall
- using ssh
  ```
  sudo ufw allow ssh
  sudo ufw allow http
  sudo ufw allow https

  ```

## Visit on browser by typing your domain name on URL bar :)
  ```
  https://roomapi.io
  ```

*** you need to point the IP address to your domain