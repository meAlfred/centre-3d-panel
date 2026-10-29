from unittest.mock import Mock

import docker
from docker.models.containers import Container, ContainerCollection

from agent.models import Container as ContainerMetrics
from agent.sources import DockerCollector


def setup_container(attrs, inspected=None, error=None):
    client = Mock()
    container = Container(attrs=attrs, client=client, collection=ContainerCollection(client))
    client.containers.list.return_value = [container]
    if error:
        client.api.inspect_container.side_effect = error
    else:
        client.api.inspect_container.return_value = inspected
    collector = DockerCollector()
    collector.client = client
    return collector, container


def test_real_sdk_sparse_name_is_read_after_inspect():
    collector, container = setup_container(
        {'Id':'a'*64, 'Names':['/adguard'], 'State':'exited'},
        {'Id':'a'*64, 'Name':'/adguard-renamed', 'State':{'Status':'exited'}},
    )
    assert container.name is None  # The exact production regression.
    row = collector.sample()[0]
    assert row['name'] == 'adguard-renamed'
    assert row['state'] == 'exited'
    ContainerMetrics.model_validate(row)


def test_vanished_container_preserves_name_from_sparse_list():
    collector, _ = setup_container(
        {'Id':'b'*64, 'Names':['/docmost'], 'State':'running'},
        error=docker.errors.NotFound('container removed between list and inspect'),
    )
    row = collector.sample()[0]
    assert row['name'] == 'docmost'
    assert row['error'] == 'container_read_failed'
    ContainerMetrics.model_validate(row)


def test_unavailable_name_is_null_not_a_fabricated_label():
    collector, _ = setup_container(
        {'Id':'c'*64}, error=docker.errors.NotFound('missing'),
    )
    row = collector.sample()[0]
    assert row['name'] is None
    assert row['id'] == 'c'*12
    ContainerMetrics.model_validate(row)
