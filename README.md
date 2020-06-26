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

### Загрузка и запуск

#### Получение исходников

**TODO: тут описать, как пользователь будет получать исходный код системы, например, с какого репозитория клонироваться**

#### Запуск системы

Хоть система и построена на основе `docker-compose` и управляется им же, как минимум первый раз систему нужно запускать с помощью скрипта `start.sh`. В состав системы входит `certbot` для автоматического получения и обновления бесплатных SSL-сертификатов от LetsEncrypt, и для первого запуска нужно предоставить необходимые данные для формирования первого сертификата для вашего хоста.

Необходимые данные:
- *доменное имя*, любого уровня. Например: `example.org`, `super.hidden.host.name.headwind.ru`. К моменту первого запуска в панели управления DNS вашего домена должна быть создана и работать A-запись об этом домене, указывающая на IP-адрес вашего сервера. Проверить работоспособность A-записи о доменном имени можно простой командой `ping my.domain.ru` - вы должны увидеть успешные ответы от сервера с вашим IP-адресом.
- *электронная почта для регистрации сертификата*. Укажите существующий и используемый вами как владельцем или администратором доменного имени ящик. На него приходят различные уведомления о продлении, отзыве и прочие действительно важные сообщения.
- *нужно ли предоставлять вашу электронную почту организации EFF*. На ваш выбор, я обычно не предоставляю.
- *является ли ваше окружение staging-окружением или production*. В случае staging `certbot` сформирует тестовый сертификат. Обычно, конечно, мы используем `production`, но бывает полезно для тестирования.
- пересоздавать ли принудительно сертификат каждый раз при запуске скрипта `start.sh`. Не рекомендуется, чтобы не исчерпать лимиты формирования сертификатов. `certbot` в составе системы сам при запуске проверяет возможность перевыпуска сертификата и делает это в соответствии с рекомендациями LetsEncrypt.

Данные можно предоставить либо в интерактивном режиме "вопрос-ответ" (всё нужное спросит скрипт `start.sh`), либо с помощью переменных окружения:
- `DOMAIN` - строка с доменом, без префиксных и суффиксных точек
- `EMAIL` - строка с электронной почтой
- `SHARE_EMAIL` - 1 или 0 ("да" или "нет")
- `STAGING` - 1 или 0 ("да" или "нет")
- `FORCE_RECREATE_CERT` - 1 или 0 ("да" или "нет")

Пример полностью автоматического запуска системы:

`DOMAIN=remoteadmin.headwind.ru EMAIL=admin@headwind.ru SHARE_EMAIL=0 STAGING=0 FORCE_RECREATE_CERT=0 ./init-start.sh`

Заданные с помощью переменных окружения или введённые вами интерактивно значения переменных при успешном запуске системы сохранятся в файле `.env.start` и будут использовать в следующий раз при запуске скрипта `start.sh`.


### Инструкция по эксплуатации

Система построена на использовании `docker-compose`, поэтому для запуска, перезапуска, остановки системы (и любых других действий) используются её команды.

Запуск:

`docker-compose up`

Система запустится в режиме foreground, остановить её можно будет комбинацией клавиш `Ctrl+C`. Для реального использований данный режим НЕ рекомендуется.

Запуск в фоне, рекомендуется:

`docker-compose up --detach`

Просмотр запущенных сервисов и их состояния:

`docker-compose ps`

Перезапуск:

`docker-compose restart`

Останов:

`docker-compose stop`

Останов с удалением контейнеров, сетей, образов

`docker-compose down`
