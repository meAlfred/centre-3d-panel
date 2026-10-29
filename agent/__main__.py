import logging

import uvicorn
from .app import create_app
from .config import Settings, validate_bind


def main():
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s: %(message)s')
    settings = Settings.from_env()
    validate_bind(settings.bind)
    # One process owns all collectors and subscribers; never use multiple workers.
    uvicorn.run(create_app(settings), host=settings.bind, port=settings.port, workers=1, access_log=False)


if __name__ == '__main__':
    main()
