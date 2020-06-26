# Remote Admin

## Инструкция по развёртыванию.

Требуется чистый сервер:
- Архитектура `x84_64` / `amd64`
- ОС Ubuntu, варианты:
	- Bionic 18.04 LTS
	- Ubuntu Xenial 16.04 LTS
- Командная оболочка `bash`

### Подготовка системы

#### Установка необходимых пакетов

`sudo apt-get update`

`sudo apt-get install mc htop git`


#### Установка docker
Взято из https://docs.docker.com/engine/install/ubuntu/

```
sudo apt-get install \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg-agent \
    software-properties-common
```

`curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -`

```
sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"
```

`sudo apt-get update`

`sudo apt-get install docker-ce docker-ce-cli containerd.io`


#### Установка docker-compose
Взято из https://docs.docker.com/compose/install/

`sudo curl -L "https://github.com/docker/compose/releases/download/1.26.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose`

Опционально, можно установить autocompletion для docker-compose (взято отсюда https://docs.docker.com/compose/completion/):

`sudo curl -L https://raw.githubusercontent.com/docker/compose/1.26.0/contrib/completion/bash/docker-compose -o /etc/bash_completion.d/docker-compose`

и сразу включить его в текущей сессии командной строки:

`. /etc/bash_completion.d/docker-compose`

### Загрузка и запуск системы

#### Получение исходников

??

#### Запуск системы

??

## Инструкция по эксплуатации

??
