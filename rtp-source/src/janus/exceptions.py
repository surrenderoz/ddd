class JanusException(BaseException):
    pass


class JanusSessionAlreadyExists(JanusException):
    ...


class JanusSessionDoesNotExists(JanusException):
    ...
