create table user
(
    uid        bigint auto_increment comment 'uid主键',
    username   varchar(100)      not null comment '用户名',
    password   longtext          not null comment '密码',
    salt       varchar(50)       not null comment '盐值',
    identity   tinyint default 0 not null comment '身份（0-普通用户 1-高级用户 2-特殊用户 3-管理员 4-超级管理员）',
    status     int     default 0 not null comment '状态（0-正常 x-封禁x月）',
    email      varchar(100)      null comment '电子邮箱',
    phone      varchar(100)      null comment '手机号',
    createtime timestamp default CURRENT_TIMESTAMP not null comment '创建时间',
    updatetime timestamp default CURRENT_TIMESTAMP on update CURRENT_TIMESTAMP not null comment '修改时间',
    bantime    timestamp         null comment '封禁时间'
    constraint user_pk
        primary key (uid)
)
    comment '用户基本信息表';

create unique index user_username_uindex
    on user (username);
